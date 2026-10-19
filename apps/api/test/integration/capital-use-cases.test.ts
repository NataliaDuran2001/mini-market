import { FixedClock, ForbiddenError, Money, ValidationError } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditPort } from '../../src/modules/access';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { getCapitalSummary } from '../../src/modules/equity/application/get-capital-summary';
import { listCapitalMovements } from '../../src/modules/equity/application/list-capital-movements';
import { recordCapitalMovement } from '../../src/modules/equity/application/record-capital-movement';
import { EQUITY_PERMISSIONS } from '../../src/modules/equity/equity.permissions';
import { DrizzleCapitalMovementRepository } from '../../src/modules/equity/infrastructure/drizzle-capital-movement.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedTenant } from '../helpers/seed';
import { expectDbError, expectTenantIsolation } from '../isolation';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe('capital use cases (S8)', () => {
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  const movements = new DrizzleCapitalMovementRepository();
  const audit = new DrizzleAuditRepository();
  const clock = new FixedClock('2026-10-15T14:00:00Z');
  const deps = (port: AuditPort = audit) => ({
    movements,
    audit: port,
    clock,
    withTransaction: testDb.withTransaction,
  });
  const read = () => ({ movements, withTransaction: testDb.withTransaction });
  const owner = () => asOwner(tenantId, { userId: OWNER_ID, permissions: EQUITY_PERMISSIONS });
  const employee = () =>
    asEmployee(tenantId, { userId: EMPLOYEE_ID, permissions: EQUITY_PERMISSIONS });
  const bs = (amount: number) => amount * 100;
  const record = (
    kind: 'contribution' | 'withdrawal',
    amountCentavos: number,
    extra: { occurredOn?: string; note?: string } = {},
  ) => recordCapitalMovement(deps(), owner(), { kind, amountCentavos, ...extra });
  const summary = async () => {
    const result = await getCapitalSummary(
      { movements, withTransaction: testDb.withTransaction },
      owner(),
    );
    if (!result.ok) throw result.error;
    return result.value;
  };
  const auditRows = async () =>
    (
      await testDb.client.query<{
        action: string;
        entity: string;
        entity_id: string;
        actor_user_id: string;
        after: Record<string, unknown>;
      }>('select action, entity, entity_id, actor_user_id, after from audit_log order by at')
    ).rows;

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    tenantId = await seedTenant(testDb, { slug: 'sol' });
    otherTenantId = await seedTenant(testDb, { slug: 'luna' });
  });

  it('nets two contributions and a withdrawal into the capital of the business', async () => {
    // AC-1
    await record('contribution', bs(10_000));
    await record('contribution', bs(2_000));
    await record('withdrawal', bs(500));

    const result = await summary();

    expect(result.contributed.toCentavos()).toBe(1_200_000n);
    expect(result.withdrawn.toCentavos()).toBe(50_000n);
    expect(result.net.toCentavos()).toBe(1_150_000n);
  });

  it('starts at zero for a business without movements', async () => {
    // AC-1
    expect((await summary()).net.toCentavos()).toBe(0n);
  });

  it('allows a withdrawal larger than the net capital, flags it and audits it', async () => {
    // AC-2
    await record('contribution', bs(1_000));

    const result = await record('withdrawal', bs(1_500));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warning).toBe(true);
    expect((await summary()).net.toCentavos()).toBe(-50_000n);
    const entries = await auditRows();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      action: 'capital.recorded',
      entity: 'capital_movement',
      entity_id: result.value.movement.id,
      actor_user_id: OWNER_ID,
      after: { kind: 'withdrawal', amountCentavos: bs(1_500), exceedsNetCapital: true },
    });
  });

  it('does not flag a withdrawal the capital covers, and audits every movement', async () => {
    // AC-2
    await record('contribution', bs(1_000));

    const result = await record('withdrawal', bs(1_000));

    expect(result.ok && result.value.warning).toBe(false);
    expect((await auditRows()).map((row) => row.after['exceedsNetCapital'])).toEqual([
      false,
      false,
    ]);
  });

  it('refuses an employee on every capital use case and changes nothing', async () => {
    // AC-3
    await record('contribution', bs(100));
    const results = [
      await recordCapitalMovement(deps(), employee(), {
        kind: 'withdrawal',
        amountCentavos: bs(50),
      }),
      await listCapitalMovements(read(), employee(), { page: 1, pageSize: 20 }),
      await getCapitalSummary(read(), employee()),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeInstanceOf(ForbiddenError);
    }
    expect((await summary()).withdrawn.toCentavos()).toBe(0n);
    expect(await auditRows()).toHaveLength(1);
  });

  it('keeps tenant A and tenant B apart in the capital ledger', async () => {
    // AC-4
    await expectTenantIsolation<{ tenantId: string }>({
      tenantA: tenantId,
      tenantB: otherTenantId,
      seed: async (id) => {
        await recordCapitalMovement(
          deps(),
          asOwner(id, { userId: OWNER_ID, permissions: EQUITY_PERMISSIONS }),
          { kind: 'contribution', amountCentavos: bs(10) },
        );
      },
      list: (scope) =>
        testDb.withTransaction(
          scope,
          async (tx) =>
            // The wrong tenant id on purpose: the policy still answers with the bound tenant only.
            (await movements.list(tx, scope?.tenantId ?? tenantId, { limit: 50, offset: 0 })).items,
        ),
      insertFor: (scope, otherId) =>
        testDb.withTransaction(scope, async (tx) => {
          await movements.insert(tx, otherId, {
            kind: 'contribution',
            amount: Money.fromCentavos(100),
            occurredAt: clock.now(),
            note: null,
            createdBy: OWNER_ID,
          });
        }),
    });
  });

  it('totals only the rows of the bound tenant even when asked for another tenant', async () => {
    // AC-4
    await record('contribution', bs(500));
    await recordCapitalMovement(
      deps(),
      asOwner(otherTenantId, { userId: OWNER_ID, permissions: EQUITY_PERMISSIONS }),
      { kind: 'contribution', amountCentavos: bs(900) },
    );

    const totals = await testDb.withTransaction(owner(), (tx) =>
      movements.totals(tx, otherTenantId),
    );

    expect(totals.contributed.toCentavos()).toBe(0n);
    expect((await summary()).contributed.toCentavos()).toBe(50_000n);
  });

  it('refuses UPDATE and DELETE on the ledger, as app_user and as the table owner', async () => {
    // Ledgers are immutable (hard rule 3)
    await record('contribution', bs(100));
    for (const statement of [
      "update capital_movements set kind = 'withdrawal'",
      'delete from capital_movements',
      'truncate capital_movements',
    ]) {
      await expectDbError(
        testDb.withTransaction(owner(), (tx) => tx.execute(sql.raw(statement))),
        /permission denied/,
      );
    }
    for (const statement of [
      "update capital_movements set kind = 'withdrawal'",
      'delete from capital_movements',
    ]) {
      await expectDbError(
        testDb.asAdmin(null, (tx) => tx.execute(sql.raw(statement))),
        /append-only/,
      );
    }
    expect((await summary()).contributed.toCentavos()).toBe(10_000n);
  });

  it('rejects an amount that is not positive and a kind that is unknown at the database', async () => {
    for (const [kind, amount] of [
      ['contribution', 0],
      ['contribution', -5],
      ['gift', 5],
    ] as const) {
      await expectDbError(
        testDb.asAdmin(null, (tx) =>
          tx.execute(
            sql`insert into capital_movements (tenant_id, kind, amount_centavos, occurred_at, created_by)
                values (${tenantId}, ${kind}, ${amount}, now(), ${OWNER_ID})`,
          ),
        ),
        /check constraint/,
      );
    }
  });

  it('rolls the movement back when the audit entry cannot be written', async () => {
    const failingAudit: AuditPort = {
      record: () => Promise.reject(new Error('audit store is down')),
    };

    await expect(
      recordCapitalMovement(deps(failingAudit), owner(), {
        kind: 'contribution',
        amountCentavos: bs(10),
      }),
    ).rejects.toThrow('audit store is down');

    expect((await summary()).contributed.toCentavos()).toBe(0n);
  });

  it('stamps the movement with the start of the chosen day in the tenant timezone', async () => {
    // ADR 0008: America/La_Paz is UTC-4, so 2026-10-01 starts at 04:00 UTC
    const past = await record('contribution', bs(10), { occurredOn: '2026-10-01' });
    const today = await record('contribution', bs(10), { occurredOn: '2026-10-15' });
    const unspecified = await record('contribution', bs(10));

    expect(past.ok && past.value.movement.occurredAt.toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    );
    expect(today.ok && today.value.movement.occurredAt.toISOString()).toBe(
      '2026-10-15T14:00:00.000Z',
    );
    expect(unspecified.ok && unspecified.value.movement.occurredAt.toISOString()).toBe(
      '2026-10-15T14:00:00.000Z',
    );
  });

  it('returns a validation error for a day that does not exist, and stores nothing', async () => {
    const result = await record('contribution', bs(10), { occurredOn: '2026-02-30' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ValidationError);
    expect(await auditRows()).toEqual([]);
  });

  it('stores an empty note as no note and keeps a written one trimmed by the contract', async () => {
    const empty = await record('contribution', bs(10), { note: '' });
    const written = await record('contribution', bs(10), { note: 'capital inicial' });

    expect(empty.ok && empty.value.movement.note).toBeNull();
    expect(written.ok && written.value.movement.note).toBe('capital inicial');
  });

  it('lists newest first with a total, and pages', async () => {
    await record('contribution', bs(1), { occurredOn: '2026-10-01' });
    await record('withdrawal', bs(2), { occurredOn: '2026-10-03' });
    await record('contribution', bs(3), { occurredOn: '2026-10-02' });

    const first = await listCapitalMovements(read(), owner(), { page: 1, pageSize: 2 });
    const second = await listCapitalMovements(read(), owner(), { page: 2, pageSize: 2 });

    expect(first.ok && first.value.total).toBe(3);
    expect(first.ok && first.value.items.map((item) => item.amount.toCentavos())).toEqual([
      200n,
      300n,
    ]);
    expect(second.ok && second.value.items.map((item) => item.amount.toCentavos())).toEqual([100n]);
  });

  it('keeps every centavo of a very large amount', async () => {
    const amount = Number.MAX_SAFE_INTEGER;
    await record('contribution', amount);
    await record('contribution', 1);

    expect((await summary()).contributed.toCentavos()).toBe(BigInt(amount) + 1n);
  });
});
