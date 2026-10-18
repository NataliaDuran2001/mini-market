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

export interface InvitationRepository {
  /**
   * Stores the invitation. A second invitation for the same email in the same tenant while one is
   * pending replaces its token and expiry, so the owner can resend. Other tenants are untouched.
   */
  savePending(tx: Transaction, invitation: NewInvitation): Promise<PendingInvitation>;
}
