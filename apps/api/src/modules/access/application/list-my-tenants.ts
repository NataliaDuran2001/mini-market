import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { AuthenticatedUser } from '../domain/identity';
import type { MyTenant } from '../domain/membership';
import type { MembershipRepository } from './ports/membership.repository';

export const LIST_MY_TENANTS = Symbol('LIST_MY_TENANTS');

export type ListMyTenants = (user: AuthenticatedUser) => Promise<readonly MyTenant[]>;

export interface ListMyTenantsDeps {
  readonly memberships: MembershipRepository;
  readonly withTransaction: WithTransaction;
}

/**
 * The businesses the signed-in user can work in, for the picker of the web. No tenant is selected
 * yet, so this is the one read that spans tenants, and it only returns the caller's own rows.
 */
export function listMyTenants(
  deps: ListMyTenantsDeps,
  user: AuthenticatedUser,
): Promise<readonly MyTenant[]> {
  return deps.withTransaction(null, (tx) => deps.memberships.listTenantsOf(tx, user.userId));
}
