import { eq, isNull } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  InvitationRepository,
  NewInvitation,
  StoredInvitation,
} from '../application/ports/invitation.repository';
import type { Role } from '../domain/identity';
import type { PendingInvitation } from '../domain/invitation';
import { invitations } from './schema';

// The invitations_role_check constraint only allows owner and employee.
const asRole = (value: string): Role => value as Role;

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
      role: asRole(row.role),
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
    };
  }

  async findByTokenHashForUpdate(
    tx: Transaction,
    tokenHash: string,
  ): Promise<StoredInvitation | null> {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1)
      .for('update');
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      role: asRole(row.role),
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    };
  }

  async markConsumed(tx: Transaction, invitationId: string, at: Date): Promise<void> {
    await tx.update(invitations).set({ consumedAt: at }).where(eq(invitations.id, invitationId));
  }
}
