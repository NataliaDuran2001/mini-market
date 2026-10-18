import { err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { NotAMemberError } from '../domain/errors';
import { grantedPermissions } from '../domain/permissions';
import { TenantContext } from '../domain/tenant-context';
import type { MembershipRepository } from './ports/membership.repository';
import type { TenantSettingsSource } from './ports/tenant-settings-source.port';
import type { PermissionRegistry } from './permission-registry';

export const RESOLVE_TENANT_CONTEXT = Symbol('RESOLVE_TENANT_CONTEXT');

export interface Caller {
  readonly userId: string;
  readonly tenantId: string;
}

export type ResolveTenantContext = (caller: Caller) => Promise<Result<TenantContext, DomainError>>;

export interface ResolveTenantContextDeps {
  readonly memberships: MembershipRepository;
  readonly settings: TenantSettingsSource;
  readonly registry: PermissionRegistry;
  readonly withTransaction: WithTransaction;
}

/**
 * Turns "this user names this tenant" into a `TenantContext`, or refuses. A user without an active
 * membership gets the same answer whether the tenant exists or not, and whether the membership was
 * never created or was disabled. Nothing is cached between requests: a disabled member or a flipped
 * setting takes effect on the next call.
 */
export async function resolveTenantContext(
  deps: ResolveTenantContextDeps,
  caller: Caller,
): Promise<Result<TenantContext, DomainError>> {
  const scope = { tenantId: caller.tenantId, userId: caller.userId, events: [] };
  const membership = await deps.withTransaction(scope, (tx) =>
    deps.memberships.findActive(tx, caller.tenantId, caller.userId),
  );
  if (!membership) {
    return err(new NotAMemberError('You are not a member of this business'));
  }
  const settings = await deps.settings.settingsOf({ ...caller, role: membership.role });
  return ok(
    new TenantContext({
      tenantId: caller.tenantId,
      userId: caller.userId,
      role: membership.role,
      settings,
      permissions: grantedPermissions(deps.registry.all(), membership.role, settings),
    }),
  );
}
