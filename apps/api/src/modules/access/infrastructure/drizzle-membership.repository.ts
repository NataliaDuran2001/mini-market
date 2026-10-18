import { and, asc, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type { MembershipRepository } from '../application/ports/membership.repository';
import type { Role } from '../domain/identity';
import type { ActiveMembership, Member, MemberStatus, MyTenant } from '../domain/membership';
import { tenants } from '../../tenancy';
import { memberships, users } from './schema';

// The CHECK constraints of the table only allow these values.
const asRole = (value: string): Role => value as Role;
const asStatus = (value: string): MemberStatus => value as MemberStatus;

const inTenantFor = (tenantId: string, userId: string) =>
  and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId));

export class DrizzleMembershipRepository implements MembershipRepository {
  async findActive(
    tx: Transaction,
    tenantId: string,
    userId: string,
  ): Promise<ActiveMembership | null> {
    const [row] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(inTenantFor(tenantId, userId), eq(memberships.status, 'active')))
      .limit(1);
    return row ? { role: asRole(row.role) } : null;
  }

  async findForUpdate(tx: Transaction, tenantId: string, userId: string): Promise<Member | null> {
    const [row] = await tx
      .select({
        userId: memberships.userId,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(inTenantFor(tenantId, userId))
      .limit(1)
      .for('update', { of: memberships });
    return row ? { ...row, role: asRole(row.role), status: asStatus(row.status) } : null;
  }

  async list(tx: Transaction, tenantId: string): Promise<readonly Member[]> {
    const rows = await tx
      .select({
        userId: memberships.userId,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, tenantId))
      .orderBy(asc(users.email));
    return rows.map((row) => ({ ...row, role: asRole(row.role), status: asStatus(row.status) }));
  }

  async countActiveOwnersForUpdate(tx: Transaction, tenantId: string): Promise<number> {
    const owners = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, tenantId),
          eq(memberships.role, 'owner'),
          eq(memberships.status, 'active'),
        ),
      )
      .for('update');
    return owners.length;
  }

  async setRole(tx: Transaction, tenantId: string, userId: string, role: Role): Promise<void> {
    await tx
      .update(memberships)
      .set({ role, updatedAt: sql`now()` })
      .where(inTenantFor(tenantId, userId));
  }

  async disable(tx: Transaction, tenantId: string, userId: string): Promise<void> {
    await tx
      .update(memberships)
      .set({ status: 'disabled', updatedAt: sql`now()` })
      .where(inTenantFor(tenantId, userId));
  }

  async activate(tx: Transaction, tenantId: string, userId: string, role: Role): Promise<void> {
    await tx
      .insert(memberships)
      .values({ tenantId, userId, role, status: 'active' })
      .onConflictDoUpdate({
        target: [memberships.tenantId, memberships.userId],
        set: { role, status: 'active', updatedAt: sql`now()` },
      });
  }

  async listTenantsOf(tx: Transaction, userId: string): Promise<readonly MyTenant[]> {
    const rows = await tx
      .select({
        tenantId: memberships.tenantId,
        slug: tenants.slug,
        name: tenants.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(asc(tenants.name));
    return rows.map((row) => ({ ...row, role: asRole(row.role) }));
  }
}
