import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/infrastructure/db/schema';
import type { Transaction } from '../../src/infrastructure/db/database';
import type { TransactionScope } from '../../src/infrastructure/db/with-transaction';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { seedMember, seedTenant } from '../helpers/seed';
import { expectDbError, expectTenantIsolation, tablesWithoutTenantTable } from '../isolation';

const USER_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const USER_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe('row level security', () => {
  let testDb: TestDb;
  let tenantA: string;
  let tenantB: string;
  const scopeOf = (tenantId: string): TransactionScope => ({ tenantId, events: [] });
  const rows = async <T>(
    scope: TransactionScope | null,
    query: (tx: Transaction) => Promise<{ rows: unknown[] }>,
  ): Promise<T[]> => (await testDb.withTransaction(scope, query)).rows as T[];
  const selectAll = (table: string) => (tx: Transaction) =>
    tx.execute(sql.raw(`select * from ${table}`)) as Promise<{ rows: unknown[] }>;

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    tenantA = await seedTenant(testDb, { slug: 'sol' });
    tenantB = await seedTenant(testDb, { slug: 'luna' });
    await seedMember(testDb, {
      tenantId: tenantA,
      userId: USER_A,
      email: 'a@e.com',
      role: 'owner',
    });
    await seedMember(testDb, {
      tenantId: tenantB,
      userId: USER_B,
      email: 'b@e.com',
      role: 'owner',
    });
  });

  it('shows a transaction bound to tenant A only the memberships of tenant A', async () => {
    // AC-1
    const found = await rows<{ tenant_id: string }>(scopeOf(tenantA), selectAll('memberships'));
    expect(found).toHaveLength(1);
    expect(found[0]?.tenant_id).toBe(tenantA);
  });

  it('rejects an INSERT for tenant B from a transaction bound to tenant A', async () => {
    // AC-2
    await expectDbError(
      testDb.withTransaction(scopeOf(tenantA), (tx) =>
        tx.execute(
          sql`insert into memberships (tenant_id, user_id, role) values (${tenantB}, ${USER_A}, 'employee')`,
        ),
      ),
      /row-level security/,
    );
  });

  it('turns an UPDATE or a cross-tenant move into no-ops or errors, never into a change of tenant B', async () => {
    await testDb.withTransaction(scopeOf(tenantA), (tx) =>
      tx.execute(sql`update memberships set role = 'employee' where tenant_id = ${tenantB}`),
    );
    await expectDbError(
      testDb.withTransaction(scopeOf(tenantA), (tx) =>
        tx.execute(sql`update memberships set tenant_id = ${tenantB} where tenant_id = ${tenantA}`),
      ),
      /row-level security/,
    );
    const { rows: untouched } = await testDb.client.query<{ role: string }>(
      'select role from memberships where tenant_id = $1',
      [tenantB],
    );
    expect(untouched).toEqual([{ role: 'owner' }]);
  });

  it('shows nothing when no tenant was bound, on every tenant table (fails closed)', async () => {
    // AC-3
    for (const table of ['memberships', 'audit_log', 'tenants']) {
      expect(await rows(null, selectAll(table)), table).toEqual([]);
    }
  });

  it('does not carry the binding of one transaction into the next', async () => {
    // AC-3: set_config is local to the transaction, so a pooled connection starts clean
    expect(await rows(scopeOf(tenantA), selectAll('memberships'))).toHaveLength(1);
    expect(await rows(null, selectAll('memberships'))).toEqual([]);
  });

  it('lets a user read their own memberships and tenants before any tenant is bound, and nobody else', async () => {
    const scope: TransactionScope = { userId: USER_A, events: [] };
    expect(await rows<{ user_id: string }>(scope, selectAll('memberships'))).toEqual([
      expect.objectContaining({ user_id: USER_A }),
    ]);
    const visible = await rows<{ id: string }>(scope, selectAll('tenants'));
    expect(visible.map((row) => row.id)).toEqual([tenantA]);
  });

  it('keeps a bound tenant from reading another tenant even when the user belongs to both', async () => {
    await seedMember(testDb, {
      tenantId: tenantB,
      userId: USER_A,
      email: 'a@e.com',
      role: 'employee',
    });
    const scope: TransactionScope = { tenantId: tenantA, events: [] };
    const found = await rows<{ tenant_id: string }>(scope, selectAll('memberships'));
    expect(found.map((row) => row.tenant_id)).toEqual([tenantA]);
  });

  it('runs the API role without BYPASSRLS, with RLS forced on the tenant tables and a policy on each', async () => {
    const { rows: role } = await testDb.client.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'app_user'",
    );
    expect(role).toEqual([{ rolbypassrls: false, rolsuper: false }]);
    const { rows: tables } = await testDb.client.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
      policies: number;
    }>(`select c.relname, c.relrowsecurity, c.relforcerowsecurity,
               (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname in ('memberships', 'audit_log', 'tenants')
         order by c.relname`);
    expect(tables).toEqual([
      { relname: 'audit_log', relrowsecurity: true, relforcerowsecurity: true, policies: 1 },
      { relname: 'memberships', relrowsecurity: true, relforcerowsecurity: true, policies: 2 },
      { relname: 'tenants', relrowsecurity: true, relforcerowsecurity: true, policies: 2 },
    ]);
  });

  it('gives app_user no UPDATE, DELETE or TRUNCATE on the audit log', async () => {
    // financial integrity: the ledger grants (docs/05-security.md section 1)
    await testDb.asAdmin(null, (tx) =>
      new DrizzleAuditRepository().record(tx, {
        tenantId: tenantA,
        actorUserId: USER_A,
        action: 'test.recorded',
        entity: 'test',
        entityId: 'x',
        at: new Date('2026-10-15T14:00:00Z'),
      }),
    );
    for (const statement of [
      "update audit_log set action = 'x'",
      'delete from audit_log',
      'truncate audit_log',
    ]) {
      await expectDbError(
        testDb.withTransaction(scopeOf(tenantA), (tx) => tx.execute(sql.raw(statement))),
        /permission denied/,
      );
    }
  });

  describe('expectTenantIsolation, the helper every repository calls', () => {
    it('holds for the memberships table', async () => {
      await expectTenantIsolation<{ tenantId: string }>({
        tenantA,
        tenantB,
        seed: (tenantId) =>
          seedMember(testDb, {
            tenantId,
            userId:
              tenantId === tenantA
                ? '3f2504e0-4f89-41d3-9a0c-0305e82c3311'
                : '3f2504e0-4f89-41d3-9a0c-0305e82c3312',
            email: `${tenantId.slice(0, 4)}@e.com`,
            role: 'employee',
          }),
        list: async (scope) =>
          (await rows<{ tenant_id: string }>(scope, selectAll('memberships'))).map((row) => ({
            tenantId: row.tenant_id,
          })),
        insertFor: (scope, tenantId) =>
          testDb
            .withTransaction(scope, (tx) =>
              tx.execute(
                sql`insert into memberships (tenant_id, user_id, role) values (${tenantId}, ${USER_A}, 'employee')`,
              ),
            )
            .then(() => undefined),
      });
    });

    it('holds for the audit log', async () => {
      await expectTenantIsolation<{ tenantId: string }>({
        tenantA,
        tenantB,
        seed: (tenantId) =>
          testDb.asAdmin(null, (tx) =>
            new DrizzleAuditRepository().record(tx, {
              tenantId,
              actorUserId: null,
              action: 'test.recorded',
              entity: 'test',
              entityId: 'x',
              at: new Date('2026-10-15T14:00:00Z'),
            }),
          ),
        list: async (scope) =>
          (await rows<{ tenant_id: string }>(scope, selectAll('audit_log'))).map((row) => ({
            tenantId: row.tenant_id,
          })),
        insertFor: (scope, tenantId) =>
          testDb.withTransaction(scope, (tx) =>
            new DrizzleAuditRepository().record(tx, {
              tenantId,
              actorUserId: null,
              action: 'test.forged',
              entity: 'test',
              entityId: 'x',
              at: new Date('2026-10-15T14:00:00Z'),
            }),
          ),
      });
    });
  });
});

describe('every table of the schema', () => {
  it('uses tenantTable() unless it is one of the documented exceptions', () => {
    // AC-4 (the real schema)
    expect(tablesWithoutTenantTable(schema)).toEqual([]);
  });

  it('lists a table created without tenantTable() by name', () => {
    // AC-4 (a rogue table)
    const rogue = pgTable('rogue_things', { id: uuid().primaryKey(), label: text().notNull() });
    expect(tablesWithoutTenantTable({ ...schema, rogue })).toEqual(['rogue_things']);
  });

  it('has row level security and a policy on every table that carries tenant_id', async () => {
    // AC-4 (the migrated database): a table that reached the database without a policy fails here
    const testDb = await createTestDb();
    try {
      const { rows } = await testDb.client.query<{ relname: string }>(`
        select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r'
           and (exists (select 1 from pg_attribute a
                         where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
                or c.relname = 'tenants')
           and c.relname <> 'invitations'
           and not (c.relrowsecurity and c.relforcerowsecurity
                    and exists (select 1 from pg_policy p where p.polrelid = c.oid))
         order by c.relname`);
      expect(rows.map((row) => row.relname)).toEqual([]);
    } finally {
      await testDb.close();
    }
  });
});
