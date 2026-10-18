/**
 * One line of the audit log (docs/05-security.md section 3). The log is append-only: entries are
 * never updated or deleted.
 */
export interface AuditEntry {
  readonly tenantId: string;
  /** Null for actions without a user, such as the operator provisioning script. */
  readonly actorUserId: string | null;
  /** Stable name, for example `member.disabled`. */
  readonly action: string;
  /** Kind of record the action touched, for example `membership`. */
  readonly entity: string;
  readonly entityId: string;
  readonly before?: Readonly<Record<string, unknown>> | undefined;
  readonly after?: Readonly<Record<string, unknown>> | undefined;
  readonly at: Date;
}
