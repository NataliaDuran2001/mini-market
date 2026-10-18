import { FixedClock, unwrapOrThrow } from '@mini-market/shared-kernel';
import { createTenant } from '../../src/modules/tenancy/application/create-tenant';
import { createTenantRepository } from '../../src/modules/tenancy/infrastructure/tenant.repository';
import { DrizzleMembershipRepository } from '../../src/modules/access/infrastructure/drizzle-membership.repository';
import { DrizzleUserRepository } from '../../src/modules/access/infrastructure/drizzle-user.repository';
import type { Role } from '../../src/modules/access';
import type { Vertical } from '../../src/modules/tenancy';
import type { TestDb } from '../harness';

/** Creates a tenant row (with the preset of its vertical) and returns its id. */
export async function seedTenant(
  testDb: TestDb,
  options: { readonly slug?: string; readonly vertical?: Vertical } = {},
): Promise<string> {
  const view = await createTenant(
    {
      tenants: createTenantRepository(testDb.asAdmin),
      events: { publish: () => Promise.resolve() },
      clock: new FixedClock('2026-10-15T14:00:00Z'),
    },
    {
      name: `Business ${options.slug ?? 'test'}`,
      slug: options.slug ?? 'test',
      vertical: options.vertical ?? 'minimarket',
    },
  );
  return unwrapOrThrow(view).id;
}

/** Creates the user mirror row and a membership; `status: 'disabled'` creates it disabled. */
export async function seedMember(
  testDb: TestDb,
  member: {
    readonly tenantId: string;
    readonly userId: string;
    readonly email: string;
    readonly role: Role;
    readonly status?: 'active' | 'disabled';
  },
): Promise<void> {
  const users = new DrizzleUserRepository();
  const memberships = new DrizzleMembershipRepository();
  await testDb.asAdmin(null, async (tx) => {
    await users.upsert(tx, { userId: member.userId, email: member.email });
    await memberships.activate(tx, member.tenantId, member.userId, member.role, null);
    if (member.status === 'disabled') {
      await memberships.disable(tx, member.tenantId, member.userId);
    }
  });
}
