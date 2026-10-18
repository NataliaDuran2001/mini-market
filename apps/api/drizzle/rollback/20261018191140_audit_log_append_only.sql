-- Rollback of 20261018191140_audit_log_append_only. Run by hand, then remove the journal entry and
-- the snapshot of that migration. Only for a database where the audit log may be edited again.
DROP TRIGGER "audit_log_append_only" ON "audit_log";
DROP FUNCTION "audit_log_reject_change"();
