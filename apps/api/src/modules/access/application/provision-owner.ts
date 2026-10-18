import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { AuditPort } from './ports/audit.port';
import type { MembershipRepository } from './ports/membership.repository';
import type { UserRepository } from './ports/user.repository';

export interface ProvisionOwnerDeps {
  readonly users: UserRepository;
  readonly memberships: MembershipRepository;
  readonly audit: AuditPort;
  readonly withTransaction: WithTransaction;
  readonly clock: Clock;
}

export interface ProvisionOwnerInput {
  readonly tenantId: string;
  /** The Supabase auth user that becomes the owner. */
  readonly userId: string;
  readonly email: string;
  /** Vertical preset the tenant was created with, recorded in the audit entry. */
  readonly preset: string;
  /** Who ran the provisioning script, recorded in the audit entry. */
  readonly operator: string;
}

/**
 * Operator tooling (issue #13), not an HTTP use case: there is no TenantContext. Both functions run
 * in a transaction bound to the tenant, like every tenant query.
 */
export async function hasActiveOwner(
  deps: Pick<ProvisionOwnerDeps, 'memberships' | 'withTransaction'>,
  tenantId: string,
): Promise<boolean> {
  const owners = await deps.withTransaction({ tenantId, events: [] }, (tx) =>
    deps.memberships.countActiveOwnersForUpdate(tx, tenantId),
  );
  return owners > 0;
}

/**
 * Mirrors the auth user, makes it the owner of the tenant and appends `tenant.provisioned` to the
 * audit log, all in one transaction. A tenant that already has an active owner is left alone.
 * @returns true when the owner membership was created
 */
export async function provisionOwner(
  deps: ProvisionOwnerDeps,
  input: ProvisionOwnerInput,
): Promise<boolean> {
  const { tenantId, userId, email, preset, operator } = input;
  return deps.withTransaction({ tenantId, events: [] }, async (tx) => {
    if ((await deps.memberships.countActiveOwnersForUpdate(tx, tenantId)) > 0) return false;
    await deps.users.upsert(tx, { userId, email });
    await deps.memberships.activate(tx, tenantId, userId, 'owner', null);
    await deps.audit.record(tx, {
      tenantId,
      actorUserId: null,
      action: 'tenant.provisioned',
      entity: 'tenant',
      entityId: tenantId,
      after: { preset, operator },
      at: deps.clock.now(),
    });
    return true;
  });
}
