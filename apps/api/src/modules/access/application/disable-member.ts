import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { LastOwnerError, MemberNotFoundError } from '../domain/errors';
import { wouldLeaveNoOwner } from '../domain/membership';
import type { Member } from '../domain/membership';
import type { TenantContext } from '../domain/tenant-context';
import type { AuditPort } from './ports/audit.port';
import type { MembershipRepository } from './ports/membership.repository';
import { requirePermission } from './require-permission';

export const DISABLE_MEMBER = Symbol('DISABLE_MEMBER');

export type DisableMember = (
  ctx: TenantContext,
  input: { readonly userId: string },
) => Promise<Result<Member, DomainError>>;

export interface DisableMemberDeps {
  readonly memberships: MembershipRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * Owner disables a member: the row stays (no physical delete of memberships), the member is
 * refused from the next request on, and the audit log records who did it. Disabling a disabled
 * member changes nothing.
 */
export async function disableMember(
  deps: DisableMemberDeps,
  ctx: TenantContext,
  input: { readonly userId: string },
): Promise<Result<Member, DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx) => {
    const member = await deps.memberships.findForUpdate(tx, ctx.tenantId, input.userId);
    if (!member) return err(new MemberNotFoundError('Member not found'));
    if (member.status === 'disabled') return ok(member);

    const owners = await deps.memberships.countActiveOwnersForUpdate(tx, ctx.tenantId);
    if (wouldLeaveNoOwner(member, owners)) {
      return err(new LastOwnerError('The business must keep at least one active owner'));
    }
    await deps.memberships.disable(tx, ctx.tenantId, input.userId);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'member.disabled',
      entity: 'membership',
      entityId: input.userId,
      before: { status: member.status, role: member.role },
      after: { status: 'disabled', role: member.role },
      at: deps.clock.now(),
    });
    return ok({ ...member, status: 'disabled' });
  });
}
