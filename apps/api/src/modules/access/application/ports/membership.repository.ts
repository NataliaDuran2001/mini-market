import type { Transaction } from '../../../../infrastructure/db/database';
import type { Role } from '../../domain/identity';
import type { ActiveMembership, Member, MyTenant } from '../../domain/membership';

/**
 * Memberships of a tenant. Every method that reads or writes one tenant takes `tenantId`
 * explicitly and puts it in the query, so a wrong id can only miss, never reach another tenant;
 * row level security (issue #12) is the second wall.
 */
export interface MembershipRepository {
  /** The role of an active member, or null (no membership, or disabled). */
  findActive(tx: Transaction, tenantId: string, userId: string): Promise<ActiveMembership | null>;

  /** The membership in any status, locked until the transaction ends. */
  findForUpdate(tx: Transaction, tenantId: string, userId: string): Promise<Member | null>;

  list(tx: Transaction, tenantId: string): Promise<readonly Member[]>;

  /** Number of active owners; locks their rows so two demotions cannot both pass the check. */
  countActiveOwnersForUpdate(tx: Transaction, tenantId: string): Promise<number>;

  setRole(tx: Transaction, tenantId: string, userId: string, role: Role): Promise<void>;

  disable(tx: Transaction, tenantId: string, userId: string): Promise<void>;

  /** Sets a disabled membership back to active, keeping its role. */
  enable(tx: Transaction, tenantId: string, userId: string): Promise<void>;

  /** Creates the membership, or reactivates a disabled one with `role`. */
  activate(
    tx: Transaction,
    tenantId: string,
    userId: string,
    role: Role,
    invitedBy: string | null,
  ): Promise<void>;

  /** Serializes the changes of one tenant's members until the transaction ends (no deadlocks). */
  lockMembers(tx: Transaction, tenantId: string): Promise<void>;

  /** Tenants where the user is an active member. Not scoped to one tenant by design. */
  listTenantsOf(tx: Transaction, userId: string): Promise<readonly MyTenant[]>;
}
