-- Rollback of 20261018191135_access_memberships_audit_log. Run by hand after the rollback of
-- 20261018191140_audit_log_append_only, then remove the journal entry and the snapshot.
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_tenant_id_tenants_id_fk";
DROP TABLE "memberships";
DROP TABLE "audit_log";
