import type { Transaction } from '../../../infrastructure/db/database';
import type { AuditPort } from '../application/ports/audit.port';
import type { AuditEntry } from '../domain/audit';
import { auditLog } from './schema';

/** Inserts only. The table rejects UPDATE and DELETE with a trigger (migration audit_log_append_only). */
export class DrizzleAuditRepository implements AuditPort {
  async record(tx: Transaction, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
      at: entry.at,
    });
  }
}
