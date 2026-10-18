import { err, ForbiddenError, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { NotAMemberError } from '../domain/errors';
import type { Role } from '../domain/identity';
import { invitationExpiry, normalizeEmail } from '../domain/invitation';
import type { InvitationRepository } from './ports/invitation.repository';
import type { InvitationTokenPort } from './ports/invitation-token.port';
import type { MembershipDirectory } from './ports/membership-directory.port';
import type { SupabaseAdminPort } from './ports/supabase-admin.port';

export const INVITE_MEMBER = Symbol('INVITE_MEMBER');

export interface InviteMemberActor {
  readonly tenantId: string;
  readonly userId: string;
}

export interface InviteMemberInput {
  readonly email: string;
  readonly role: Extract<Role, 'employee'>;
}

export interface InvitationReceipt {
  readonly invitationId: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: Date;
  /** `existing_user`: the email already has an account, so the invitation is accepted with it. */
  readonly delivery: 'invited' | 'existing_user';
}

export type InviteMember = (
  actor: InviteMemberActor,
  input: InviteMemberInput,
) => Promise<Result<InvitationReceipt, DomainError>>;

export interface InviteMemberDeps {
  readonly clock: Clock;
  readonly invitations: InvitationRepository;
  readonly memberships: MembershipDirectory;
  readonly supabaseAdmin: SupabaseAdminPort;
  readonly tokens: InvitationTokenPort;
  readonly withTransaction: WithTransaction;
  /** Web page that finishes the invitation, for example `https://app.example/accept-invitation`. */
  readonly acceptInvitationUrl: string;
}

/**
 * Owner invites a person into the tenant (docs/01-domain.md section 4: invite or remove users is
 * owner only). The invitation is stored first and committed; the email goes out afterwards, so a
 * failed send leaves a pending invitation the owner can resend instead of a half-open transaction.
 */
export async function inviteMember(
  deps: InviteMemberDeps,
  actor: InviteMemberActor,
  input: InviteMemberInput,
): Promise<Result<InvitationReceipt, DomainError>> {
  const role = await deps.withTransaction(null, (tx) =>
    deps.memberships.roleOf(tx, actor.tenantId, actor.userId),
  );
  if (role === null) {
    return err(new NotAMemberError('You are not a member of this business'));
  }
  if (role !== 'owner') {
    return err(
      new ForbiddenError('Only the owner can invite members', { permission: 'members.manage' }),
    );
  }

  const email = normalizeEmail(input.email);
  const { token, tokenHash } = deps.tokens.generate();
  const invitation = await deps.withTransaction(null, (tx) =>
    deps.invitations.savePending(tx, {
      tenantId: actor.tenantId,
      email,
      role: input.role,
      invitedBy: actor.userId,
      tokenHash,
      expiresAt: invitationExpiry(deps.clock.now()),
    }),
  );

  const outcome = await deps.supabaseAdmin.inviteUserByEmail({
    email,
    redirectTo: `${deps.acceptInvitationUrl}?token=${encodeURIComponent(token)}`,
  });

  return ok({
    invitationId: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    delivery: outcome === 'invited' ? 'invited' : 'existing_user',
  });
}
