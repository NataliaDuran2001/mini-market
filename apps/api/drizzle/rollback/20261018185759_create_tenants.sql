-- Rollback of 20261018185759_create_tenants. Run by hand, then remove the journal entry and the
-- snapshot of that migration. Destroys every tenant and its settings.
DROP TABLE "tenants";
