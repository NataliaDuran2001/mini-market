import type { Transaction } from '../../../../infrastructure/db/database';
import type { Role } from '../../domain/identity';
import type { OpenInvitation, PendingInvitation } from '../../domain/invitation';
import type { TenantContext } from '../../domain/tenant-context';

export interface NewInvitation {
  readonly tenantId: string;
  readonly email: string;
  readonly role: Role;
  readonly invitedBy: string;
  /** SHA-256 of the token; the token itself only travels in the invitation link. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface StoredInvitation extends PendingInvitation {
  /** Set once the invitation was accepted; an invitation is used at most once. */
  readonly consumedAt: Date | null;
}

export interface InvitationRepository {
  /**
   * Stores the invitation. A second invitation for the same email in the same tenant while one is
   * pending replaces its token and expiry, so the owner can resend. Other tenants are untouched.
   */
  savePending(tx: Transaction, invitation: NewInvitation): Promise<PendingInvitation>;

  /**
   * Looks an invitation up by the hash of its token and locks the row until the transaction ends,
   * so two accept requests with the same token cannot both succeed. This is the one read that is
   * not scoped to a tenant: the invitee has no membership yet, the token is the capability.
   */
  findByTokenHashForUpdate(tx: Transaction, tokenHash: string): Promise<StoredInvitation | null>;

  /**
   * Invitations of `ctx.tenantId` that were not accepted, expired ones included, newest first.
   * `invitations` is not under row level security, so this query is the only wall between
   * tenants: it filters by the tenant of the context and nothing else. It never selects the
   * token hash.
   */
  listOpen(tx: Transaction, ctx: TenantContext): Promise<readonly OpenInvitation[]>;

  markConsumed(tx: Transaction, invitationId: string, at: Date): Promise<void>;
}
