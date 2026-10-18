import type { Transaction } from '../../../../infrastructure/db/database';
import type { AuditEntry } from '../../domain/audit';

/** Injection token of the audit port; other modules import it from `access/index.ts`. */
export const AUDIT_PORT = Symbol('AUDIT_PORT');

/**
 * Appends to the audit log inside the caller's transaction, so the entry exists exactly when the
 * audited change committed (docs/05-security.md section 3).
 */
export interface AuditPort {
  record(tx: Transaction, entry: AuditEntry): Promise<void>;
}
