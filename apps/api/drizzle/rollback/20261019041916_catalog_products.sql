-- Rollback of 20261019041916_catalog_products. Run by hand, then remove the journal entry and the
-- snapshot. Drops every product of every tenant: only for a throwaway database.
DROP TABLE "product_presentations";
DROP TABLE "products";
DROP INDEX "units_tenant_id_id_idx";
DROP INDEX "categories_tenant_id_id_idx";
