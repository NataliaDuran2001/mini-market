-- Rollback of 20261019052736_inventory_ledger. Run by hand, then remove the journal entry and the
-- snapshot. Destroys the stock ledger of every tenant: only for a throwaway database (ledgers are
-- never rolled back by deleting rows in production).
DROP TRIGGER "stock_movements_append_only" ON "stock_movements";
DROP FUNCTION "stock_movements_reject_change"();
DROP TABLE "stock_levels";
DROP TABLE "stock_movements";
