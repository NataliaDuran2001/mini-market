import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { MemberNotFoundError } from '../domain/errors';
import type { Member } from '../domain/membership';
import type { TenantContext } from '../domain/tenant-context';
import type { AuditPort } from './ports/audit.port';
import type { MembershipRepository } from './ports/membership.repository';
import { requirePermission } from './require-permission';

export const ENABLE_MEMBER = Symbol('ENABLE_MEMBER');

export type EnableMember = (
  ctx: TenantContext,
  input: { readonly userId: string },
) => Promise<Result<Member, DomainError>>;

export interface EnableMemberDeps {
  readonly memberships: MembershipRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * Owner brings a disabled member back: same role, active from the next request on, and the audit
 * log records who did it. Enabling an active member changes nothing and writes no audit entry.
 */
export async function enableMember(
  deps: EnableMemberDeps,
  ctx: TenantContext,
  input: { readonly userId: string },
): Promise<Result<Member, DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx) => {
    await deps.memberships.lockMembers(tx, ctx.tenantId);
    const member = await deps.memberships.findForUpdate(tx, ctx.tenantId, input.userId);
    if (!member) return err(new MemberNotFoundError('Member not found'));
    if (member.status === 'active') return ok(member);

    await deps.memberships.enable(tx, ctx.tenantId, input.userId);
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'member.enabled',
      entity: 'membership',
      entityId: input.userId,
      before: { status: member.status, role: member.role },
      after: { status: 'active', role: member.role },
      at: deps.clock.now(),
    });
    return ok({ ...member, status: 'active' });
  });
}
