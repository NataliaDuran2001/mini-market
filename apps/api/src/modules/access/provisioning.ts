import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { hasActiveOwner, provisionOwner } from './application/provision-owner';
import type { ProvisionOwnerInput } from './application/provision-owner';
import { DrizzleAuditRepository } from './infrastructure/drizzle-audit.repository';
import { DrizzleMembershipRepository } from './infrastructure/drizzle-membership.repository';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository';

export interface OwnerProvisioning {
  hasActiveOwner(tenantId: string): Promise<boolean>;
  provisionOwner(input: ProvisionOwnerInput): Promise<boolean>;
}

/** Wires the provisioning use cases to Drizzle for the operator script (issue #13). */
export function createOwnerProvisioning(
  withTransaction: WithTransaction,
  clock: Clock,
): OwnerProvisioning {
  const deps = {
    users: new DrizzleUserRepository(),
    memberships: new DrizzleMembershipRepository(),
    audit: new DrizzleAuditRepository(),
    withTransaction,
    clock,
  };
  return {
    hasActiveOwner: (tenantId) => hasActiveOwner(deps, tenantId),
    provisionOwner: (input) => provisionOwner(deps, input),
  };
}
