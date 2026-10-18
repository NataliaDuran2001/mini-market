import { isNull } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  InvitationRepository,
  NewInvitation,
} from '../application/ports/invitation.repository';
import type { Role } from '../domain/identity';
import type { PendingInvitation } from '../domain/invitation';
import { invitations } from './schema';

export class DrizzleInvitationRepository implements InvitationRepository {
  async savePending(tx: Transaction, invitation: NewInvitation): Promise<PendingInvitation> {
    const fields = {
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      tokenHash: invitation.tokenHash,
      expiresAt: invitation.expiresAt,
    };
    // The conflict target is the partial unique index (tenant_id, email) where consumed_at is null:
    // a resend replaces the pending row of this tenant and never touches another tenant's.
    const [row] = await tx
      .insert(invitations)
      .values({ tenantId: invitation.tenantId, email: invitation.email, ...fields })
      .onConflictDoUpdate({
        target: [invitations.tenantId, invitations.email],
        targetWhere: isNull(invitations.consumedAt),
        set: fields,
      })
      .returning();
    if (!row) {
      throw new Error('invitation upsert returned no row');
    }
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      role: row.role as Role, // the invitations_role_check constraint only allows owner and employee
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
    };
  }
}
