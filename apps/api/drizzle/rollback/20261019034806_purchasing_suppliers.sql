-- Rollback of 20261019034806_purchasing_suppliers. Run by hand, then remove the journal entry and the snapshot of that migration.
-- Drops every supplier: only for a throwaway database or before purchases reference them.
DROP TABLE "suppliers";
