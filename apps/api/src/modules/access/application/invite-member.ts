import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { InviteDeliveryFailedError } from '../domain/errors';
import type { Role } from '../domain/identity';
import { invitationExpiry, normalizeEmail } from '../domain/invitation';
import type { TenantContext } from '../domain/tenant-context';
import type { InvitationRepository } from './ports/invitation.repository';
import type { InvitationTokenPort } from './ports/invitation-token.port';
import type { SupabaseAdminPort } from './ports/supabase-admin.port';
import { requirePermission } from './require-permission';

export const INVITE_MEMBER = Symbol('INVITE_MEMBER');

export interface InviteMemberInput {
  readonly email: string;
  readonly role: Extract<Role, 'employee'>;
}

export interface InvitationReceipt {
  readonly invitationId: string;
  readonly email: string;
  readonly role: Role;
  readonly expiresAt: Date;
}

export type InviteMember = (
  ctx: TenantContext,
  input: InviteMemberInput,
) => Promise<Result<InvitationReceipt, DomainError>>;

export interface InviteMemberDeps {
  readonly clock: Clock;
  readonly invitations: InvitationRepository;
  readonly supabaseAdmin: SupabaseAdminPort;
  readonly tokens: InvitationTokenPort;
  readonly withTransaction: WithTransaction;
  /** Records an infrastructure failure that the use case turns into an expected error. */
  readonly reportFailure: (error: unknown) => void;
  /** Web page that finishes the invitation, for example `https://app.example/accept-invitation`. */
  readonly acceptInvitationUrl: string;
}

/**
 * Owner invites a person into the tenant (docs/01-domain.md section 4: invite or remove users is
 * owner only). The invitation is stored first and committed; the email goes out afterwards, so a
 * failed send leaves a pending invitation the owner can resend instead of a half-open transaction.
 * The receipt never says whether the email already has an account.
 */
export async function inviteMember(
  deps: InviteMemberDeps,
  ctx: TenantContext,
  input: InviteMemberInput,
): Promise<Result<InvitationReceipt, DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;

  const email = normalizeEmail(input.email);
  const { token, tokenHash } = deps.tokens.generate();
  const invitation = await deps.withTransaction(ctx, (tx) =>
    deps.invitations.savePending(tx, {
      tenantId: ctx.tenantId,
      email,
      role: input.role,
      invitedBy: ctx.userId,
      tokenHash,
      expiresAt: invitationExpiry(deps.clock.now()),
    }),
  );

  try {
    await deps.supabaseAdmin.inviteUserByEmail({
      email,
      redirectTo: `${deps.acceptInvitationUrl}?token=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    deps.reportFailure(error);
    return err(new InviteDeliveryFailedError('The invitation email could not be sent; try again'));
  }

  return ok({
    invitationId: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  });
}
