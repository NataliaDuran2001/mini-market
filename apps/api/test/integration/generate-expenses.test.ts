import { FixedClock, Money, Period } from '@mini-market/shared-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runGenerateExpenses } from '../../scripts/generate-expenses';
import type { TenantToGenerate } from '../../scripts/generate-expenses';
import { DrizzleExpenseRepository } from '../../src/modules/payables/infrastructure/drizzle-expense.repository';
import { DrizzleRecurringExpenseRepository } from '../../src/modules/payables/infrastructure/drizzle-recurring-expense.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { seedCatalogIds } from '../helpers/catalog-ids';
import { seedTenant } from '../helpers/seed';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('expenses:generate script (S5)', () => {
  let testDb: TestDb;
  let tenants: TenantToGenerate[];
  let lines: string[];
  let errors: string[];
  const recurring = new DrizzleRecurringExpenseRepository();
  // 2026-11-01 02:00 UTC is still October 31, 22:00 in La Paz.
  const clock = new FixedClock('2026-11-01T02:00:00Z');
  const run = (...argv: string[]) =>
    runGenerateExpenses(
      {
        expenses: new DrizzleExpenseRepository(),
        recurring,
        listTenants: () => Promise.resolve(tenants),
        withTransaction: testDb.asAdmin,
        clock,
        log: (line) => lines.push(line),
        logError: (line) => errors.push(line),
      },
      argv,
    );
  const rows = async () =>
    (
      await testDb.client.query<{ slug: string; period: string }>(
        `select t.slug, e.period_year || '-' || lpad(e.period_month::text, 2, '0') as period
         from expenses e join tenants t on t.id = e.tenant_id order by t.slug, period`,
      )
    ).rows;

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    lines = [];
    errors = [];
    tenants = [];
    for (const slug of ['sol', 'luna']) {
      const id = await seedTenant(testDb, { slug });
      const ids = await seedCatalogIds(testDb, id);
      await testDb.asAdmin({ tenantId: id, events: [] }, (tx) =>
        recurring.insert(tx, id, {
          expenseCategoryId: ids.rent,
          name: 'Alquiler',
          amount: Money.fromCentavos(150000),
          dayOfMonthDue: 5,
          active: true,
          startsPeriod: Period.of(2026, 10),
          endsPeriod: null,
          createdBy: OWNER_ID,
        }),
      );
      tenants.push({ id, slug, timezone: 'America/La_Paz' });
    }
  });

  it('generates the current month of every business in its own timezone, and never twice', async () => {
    expect(await run()).toBe(0);
    expect(await rows()).toEqual([
      { slug: 'luna', period: '2026-10' },
      { slug: 'sol', period: '2026-10' },
    ]);
    expect(lines).toEqual(['sol: 2026-10 created 1', 'luna: 2026-10 created 1']);

    lines.length = 0;
    expect(await run()).toBe(0);
    expect(lines).toEqual(['sol: 2026-10 created 0', 'luna: 2026-10 created 0']);
    expect(await rows()).toHaveLength(2);
  });

  it('uses the period it is given', async () => {
    expect(await run('--', '--period', '2026-11')).toBe(0);
    expect((await rows()).map((row) => row.period)).toEqual(['2026-11', '2026-11']);
  });

  it('rejects a malformed period without touching anything', async () => {
    expect(await run('--period', '2026-13')).toBe(1);
    expect(errors.join('\n')).toContain('--period must be YYYY-MM');
    expect(await rows()).toEqual([]);
  });

  it('keeps going when one business fails and reports it with exit code 1', async () => {
    tenants = [
      { id: tenants[0]?.id ?? '', slug: 'broken', timezone: 'Not/AZone' },
      ...tenants.slice(1),
    ];

    expect(await run()).toBe(1);

    expect(errors.join('\n')).toContain('broken: failed');
    expect(lines).toEqual(['luna: 2026-10 created 1']);
    expect(await rows()).toEqual([{ slug: 'luna', period: '2026-10' }]);
  });
});
