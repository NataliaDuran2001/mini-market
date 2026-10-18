-- Rollback of 20261018210510_memberships_tenant_id_index. Run by hand, then remove the journal
-- entry and the snapshot of that migration.
DROP INDEX "memberships_tenant_id_idx";
