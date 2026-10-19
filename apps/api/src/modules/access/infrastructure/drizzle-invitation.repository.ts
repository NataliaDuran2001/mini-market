import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  InvitationRepository,
  NewInvitation,
  StoredInvitation,
} from '../application/ports/invitation.repository';
import type { Role } from '../domain/identity';
import type { OpenInvitation, PendingInvitation } from '../domain/invitation';
import type { TenantContext } from '../domain/tenant-context';
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

  async listOpen(tx: Transaction, ctx: TenantContext): Promise<readonly OpenInvitation[]> {
    const rows = await tx
      .select({
        id: invitations.id,
        tenantId: invitations.tenantId,
        email: invitations.email,
        role: invitations.role,
        invitedAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(and(eq(invitations.tenantId, ctx.tenantId), isNull(invitations.consumedAt)))
      .orderBy(desc(invitations.createdAt), desc(invitations.id));
    return rows.map((row) => ({ ...row, role: asRole(row.role) }));
  }

  async markConsumed(tx: Transaction, invitationId: string, at: Date): Promise<void> {
    await tx.update(invitations).set({ consumedAt: at }).where(eq(invitations.id, invitationId));
  }
}
