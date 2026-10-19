import { ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { Role } from '../domain/identity';
import { invitationStatus } from '../domain/invitation';
import type { InvitationStatus } from '../domain/invitation';
import type { TenantContext } from '../domain/tenant-context';
import type { InvitationRepository } from './ports/invitation.repository';
import { requirePermission } from './require-permission';

export const LIST_INVITATIONS = Symbol('LIST_INVITATIONS');

/** What the owner sees of an invitation. No token, no hash, no tenant id. */
export interface InvitationListItem {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly expiresAt: Date;
  readonly status: InvitationStatus;
}

export type ListInvitations = (
  ctx: TenantContext,
) => Promise<Result<readonly InvitationListItem[], DomainError>>;

export interface ListInvitationsDeps {
  readonly invitations: InvitationRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Owner lists the invitations of the tenant that are still open: pending or expired, newest first. */
export async function listInvitations(
  deps: ListInvitationsDeps,
  ctx: TenantContext,
): Promise<Result<readonly InvitationListItem[], DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;

  const rows = await deps.withTransaction(ctx, (tx) => deps.invitations.listOpen(tx, ctx));
  const now = deps.clock.now();
  return ok(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      invitedAt: row.invitedAt,
      expiresAt: row.expiresAt,
      status: invitationStatus(row.expiresAt, now),
    })),
  );
}
