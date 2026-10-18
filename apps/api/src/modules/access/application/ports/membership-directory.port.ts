import type { Transaction } from '../../../../infrastructure/db/database';
import type { Role } from '../../domain/identity';

/**
 * Role of a user in a tenant, or null when there is no active membership. Issue #11 provides the
 * real implementation over the `memberships` table; until then the module wires a fail-closed one.
 */
export interface MembershipDirectory {
  roleOf(tx: Transaction, tenantId: string, userId: string): Promise<Role | null>;
}
