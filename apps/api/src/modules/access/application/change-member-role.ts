import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { LastOwnerError, MemberNotFoundError } from '../domain/errors';
import type { Role } from '../domain/identity';
import { wouldLeaveNoOwner } from '../domain/membership';
import type { Member } from '../domain/membership';
import type { TenantContext } from '../domain/tenant-context';
import type { AuditPort } from './ports/audit.port';
import type { MembershipRepository } from './ports/membership.repository';
import { requirePermission } from './require-permission';

export const CHANGE_MEMBER_ROLE = Symbol('CHANGE_MEMBER_ROLE');

export interface ChangeMemberRoleInput {
  readonly userId: string;
  readonly role: Role;
}

export type ChangeMemberRole = (
  ctx: TenantContext,
  input: ChangeMemberRoleInput,
) => Promise<Result<Member, DomainError>>;

export interface ChangeMemberRoleDeps {
  readonly memberships: MembershipRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Owner changes the role of a member; the tenant always keeps one active owner. */
export async function changeMemberRole(
  deps: ChangeMemberRoleDeps,
  ctx: TenantContext,
  input: ChangeMemberRoleInput,
): Promise<Result<Member, DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx) => {
    await deps.memberships.lockMembers(tx, ctx.tenantId);
    const member = await deps.memberships.findForUpdate(tx, ctx.tenantId, input.userId);
    if (!member) return err(new MemberNotFoundError('Member not found'));
    if (member.role === input.role) return ok(member);

    const owners =
      member.role === 'owner' && member.status === 'active'
        ? await deps.memberships.countActiveOwnersForUpdate(tx, ctx.tenantId)
        : 0;
    if (wouldLeaveNoOwner(member, owners)) {
      return err(new LastOwnerError('The business must keep at least one active owner'));
    }
    await deps.memberships.setRole(tx, ctx.tenantId, input.userId, input.role);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'member.role_changed',
      entity: 'membership',
      entityId: input.userId,
      before: { role: member.role },
      after: { role: input.role },
      at: deps.clock.now(),
    });
    return ok({ ...member, role: input.role });
  });
}
