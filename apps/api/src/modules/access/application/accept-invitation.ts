import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
} from '../domain/errors';
import type { AuthenticatedUser, Role } from '../domain/identity';
import { normalizeEmail } from '../domain/invitation';
import type { AuditPort } from './ports/audit.port';
import type { InvitationRepository } from './ports/invitation.repository';
import type { InvitationTokenPort } from './ports/invitation-token.port';
import type { MembershipRepository } from './ports/membership.repository';

export const ACCEPT_INVITATION = Symbol('ACCEPT_INVITATION');

export interface Accepted {
  readonly tenantId: string;
  readonly role: Role;
}

export type AcceptInvitation = (
  user: AuthenticatedUser,
  token: string,
) => Promise<Result<Accepted, DomainError>>;

export interface AcceptInvitationDeps {
  readonly invitations: InvitationRepository;
  readonly memberships: MembershipRepository;
  readonly tokens: InvitationTokenPort;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * The invitee, signed in through Supabase, redeems the token of the link. Not tenant scoped: the
 * invitee has no membership yet. The row is locked, so two requests with the same token cannot
 * both succeed (the second answers 409), and only the person the invitation was sent to may use
 * it, even when the link was forwarded.
 */
export async function acceptInvitation(
  deps: AcceptInvitationDeps,
  user: AuthenticatedUser,
  token: string,
): Promise<Result<Accepted, DomainError>> {
  return deps.withTransaction(null, async (tx) => {
    const invitation = await deps.invitations.findByTokenHashForUpdate(tx, deps.tokens.hash(token));
    if (!invitation) return err(new InvitationNotFoundError('Invitation not found'));
    if (invitation.consumedAt) {
      return err(new InvitationAlreadyUsedError('This invitation was already used'));
    }
    const now = deps.clock.now();
    if (invitation.expiresAt <= now) {
      return err(new InvitationExpiredError('This invitation has expired'));
    }
    if (invitation.email !== normalizeEmail(user.email)) {
      return err(new InvitationNotFoundError('Invitation not found'));
    }

    const existing = await deps.memberships.findForUpdate(tx, invitation.tenantId, user.userId);
    await deps.invitations.markConsumed(tx, invitation.id, now);
    if (existing?.status === 'active') {
      // Already a member: the invitation is spent and the role stays as it is, so an invitation
      // can never demote an owner.
      return ok({ tenantId: invitation.tenantId, role: existing.role });
    }
    await deps.memberships.activate(tx, invitation.tenantId, user.userId, invitation.role);
    await deps.audit.record(tx, {
      tenantId: invitation.tenantId,
      actorUserId: user.userId,
      action: 'member.joined',
      entity: 'membership',
      entityId: user.userId,
      before: existing ? { status: existing.status, role: existing.role } : undefined,
      after: { status: 'active', role: invitation.role },
      at: now,
    });
    return ok({ tenantId: invitation.tenantId, role: invitation.role });
  });
}
