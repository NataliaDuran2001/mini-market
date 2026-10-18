import { FixedClock } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runProvision } from '../../scripts/provision-tenant';
import type { ProvisionDeps } from '../../scripts/provision-tenant';
import { memberships } from '../../src/modules/access/infrastructure/schema';
import type { SupabaseUserDirectory } from '../../src/modules/access';
import { createOwnerProvisioning } from '../../src/modules/access';
import { createTenantRepository, presetFor } from '../../src/modules/tenancy';
import type { CatalogSeeder } from '../../src/modules/tenancy';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { expectTenantIsolation } from '../isolation';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const clock = new FixedClock('2026-10-15T14:00:00Z');
const ARGS = [
  '--name',
  'Mini Market Doña X',
  '--slug',
  'minimarket-x',
  '--preset',
  'minimarket',
  '--owner-email',
  'owner@example.com',
];

describe('provision-tenant script on PGlite', () => {
  let testDb: TestDb;
  let invites: { email: string; redirectTo: string }[];
  let boundTenants: (string | null)[];
  let stdout: string[];
  let stderr: string[];
  let existingAccount: boolean;

  // Supabase Auth replaced by a fake: a new address gets an id and an invitation, a known one only its id.
  const directory: SupabaseUserDirectory = {
    findOrInviteUser: (request) => {
      if (existingAccount) return Promise.resolve({ userId: OWNER_ID, invited: false });
      invites.push(request);
      return Promise.resolve({ userId: OWNER_ID, invited: true });
    },
  };
  const seeder: CatalogSeeder = async (tx) => {
    const { rows } = (await tx.execute(sql`select app.current_tenant_id() as id`)) as {
      rows: { id: string | null }[];
    };
    boundTenants.push(rows[0]?.id ?? null);
  };

  // The script writes as the owner role; seeders run through the app_user role like the API, so
  // they prove the tenant binding.
  const deps = (): ProvisionDeps => ({
    tenants: createTenantRepository(testDb.asAdmin),
    access: createOwnerProvisioning(testDb.asAdmin, clock),
    directory,
    withTransaction: testDb.withTransaction,
    seeders: [seeder],
    clock,
    redirectTo: 'http://localhost:5201/reset-password',
    operator: 'operator-test',
    log: (line) => stdout.push(line),
    logError: (line) => stderr.push(line),
  });
  const count = async (table: string): Promise<number> => {
    const { rows } = await testDb.client.query<{ n: number }>(
      `select count(*)::int as n from ${table}`,
    );
    return rows[0]?.n ?? 0;
  };

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    invites = [];
    boundTenants = [];
    stdout = [];
    stderr = [];
    existingAccount = false;
  });

  it('creates the tenant with its preset, the owner membership, the catalogs and the invitation', async () => {
    // AC-1
    expect(await runProvision(deps(), ARGS)).toBe(0);

    const { rows: tenants } = await testDb.client.query<{
      id: string;
      slug: string;
      settings: { timezone: string; currency: string };
    }>('select id, slug, settings from tenants');
    expect(tenants).toHaveLength(1);
    expect(tenants[0]?.slug).toBe('minimarket-x');
    expect(tenants[0]?.settings).toMatchObject({ currency: 'BOB' });
    const tenantId = tenants[0]?.id;

    const { rows: members } = await testDb.client.query(
      'select tenant_id, user_id, role, status from memberships',
    );
    expect(members).toEqual([
      { tenant_id: tenantId, user_id: OWNER_ID, role: 'owner', status: 'active' },
    ]);
    const { rows: users } = await testDb.client.query('select id, email from users');
    expect(users).toEqual([{ id: OWNER_ID, email: 'owner@example.com' }]);
    expect(invites).toEqual([
      { email: 'owner@example.com', redirectTo: 'http://localhost:5201/reset-password' },
    ]);
    // The catalogs are seeded in a transaction bound to the new tenant.
    expect(boundTenants).toEqual([tenantId]);
    const { rows: audit } = await testDb.client.query<{ action: string; after: unknown }>(
      'select action, after from audit_log',
    );
    expect(audit).toEqual([
      { action: 'tenant.provisioned', after: { preset: 'minimarket', operator: 'operator-test' } },
    ]);
    expect(stdout.join('\n')).toContain('invitation email sent');
  });

  it('creates nothing and exits 0 when the slug already exists', async () => {
    // AC-2
    expect(await runProvision(deps(), ARGS)).toBe(0);
    stdout.length = 0;

    expect(await runProvision(deps(), ARGS)).toBe(0);

    expect(await count('tenants')).toBe(1);
    expect(await count('memberships')).toBe(1);
    expect(await count('users')).toBe(1);
    expect(await count('audit_log')).toBe(1);
    expect(invites).toHaveLength(1);
    expect(boundTenants).toHaveLength(1);
    expect(stdout.join('\n')).toContain('already exists');
    expect(stderr).toEqual([]);
  });

  it('exits 1 with the usage when the preset is not one of the presets', async () => {
    // AC-3
    const bad = ARGS.map((arg) => (arg === 'minimarket' ? 'ferreteria' : arg));
    expect(await runProvision(deps(), bad)).toBe(1);

    expect(stderr.join('\n')).toContain('Usage: pnpm --filter @mini-market/api provision');
    expect(stderr.join('\n')).toContain('minimarket|farmacia|generic');
    expect(await count('tenants')).toBe(0);
    expect(invites).toEqual([]);
  });

  it('exits 1 with the usage for a missing option, an unknown option or a bad email', async () => {
    // AC-3
    expect(await runProvision(deps(), ARGS.slice(0, 6))).toBe(1);
    expect(await runProvision(deps(), [...ARGS, '--force'])).toBe(1);
    expect(
      await runProvision(
        deps(),
        ARGS.map((a) => (a === 'owner@example.com' ? 'nope' : a)),
      ),
    ).toBe(1);
    expect(stderr.filter((line) => line.startsWith('Usage:'))).toHaveLength(3);
    expect(await count('tenants')).toBe(0);
  });

  it('accepts the separator pnpm passes before the options', async () => {
    expect(await runProvision(deps(), ['--', ...ARGS])).toBe(0);
    expect(await count('tenants')).toBe(1);
  });

  it('makes an owner of an address that already has an account, without sending an email', async () => {
    existingAccount = true;
    expect(await runProvision(deps(), ARGS)).toBe(0);
    expect(invites).toEqual([]);
    expect(await count('memberships')).toBe(1);
    expect(stdout.join('\n')).toContain('existing account, no email');
  });

  it('completes a tenant that was created but has no owner, and leaves a tenant with an owner alone', async () => {
    await createTenantRepository(testDb.asAdmin).create({
      slug: 'minimarket-x',
      name: 'Mini Market Doña X',
      settings: presetFor('minimarket'),
      createdAt: clock.now(),
    });
    expect(await runProvision(deps(), ARGS)).toBe(0);
    expect(await count('tenants')).toBe(1);
    expect(await count('memberships')).toBe(1);

    // Another owner email in a later run must not add a second owner.
    expect(
      await runProvision(
        deps(),
        ARGS.map((a) => (a === 'owner@example.com' ? 'x@e.com' : a)),
      ),
    ).toBe(0);
    expect(await count('memberships')).toBe(1);
  });

  it('keeps the provisioned owner memberships isolated per tenant', async () => {
    // Tenant isolation through the reusable helper, on the table the script writes.
    const tenants = createTenantRepository(testDb.asAdmin);
    const access = createOwnerProvisioning(testDb.asAdmin, clock);
    const make = async (slug: string) => {
      const created = await tenants.create({
        slug,
        name: slug,
        settings: presetFor('generic'),
        createdAt: clock.now(),
      });
      if (!created.ok) throw created.error;
      return created.value.id;
    };
    const [tenantA, tenantB] = [await make('tenant-a'), await make('tenant-b')];
    await expectTenantIsolation({
      tenantA,
      tenantB,
      seed: async (tenantId) => {
        const userId = tenantId === tenantA ? OWNER_ID : OTHER_ID;
        await access.provisionOwner({
          tenantId,
          userId,
          email: `${userId}@e.com`,
          preset: 'generic',
          operator: 'op',
        });
      },
      list: (scope) => testDb.withTransaction(scope, (tx) => tx.select().from(memberships)),
      insertFor: (scope, tenantId) =>
        testDb
          .withTransaction(scope, (tx) =>
            tx.insert(memberships).values({ tenantId, userId: OWNER_ID, role: 'employee' }),
          )
          .then(() => undefined),
    });
    // The slug lookup is provisioning only: as app_user without a tenant it finds nothing.
    const asApp = createTenantRepository(testDb.withTransaction);
    expect(await asApp.findBySlug('tenant-a')).toBeNull();
    expect((await tenants.findBySlug('tenant-a'))?.id).toBe(tenantA);
  });
});
