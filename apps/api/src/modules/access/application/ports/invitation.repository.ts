import type { Transaction } from '../../../../infrastructure/db/database';
import type { Role } from '../../domain/identity';
import type { PendingInvitation } from '../../domain/invitation';

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

  markConsumed(tx: Transaction, invitationId: string, at: Date): Promise<void>;
}
