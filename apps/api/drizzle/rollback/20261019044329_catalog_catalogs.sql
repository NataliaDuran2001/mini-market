-- Rollback of 20261019044329_catalog_catalogs. Run by hand, then remove the journal entry and the
-- snapshot. Drops the catalogs of every tenant: only for a throwaway database.
DROP TABLE "expense_categories";
DROP TABLE "payment_methods";
DROP TABLE "units";
DROP TABLE "categories";
