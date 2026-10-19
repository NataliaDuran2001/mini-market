-- Rollback of 20261019040826_equity_capital_movements. Run by hand, then remove the journal entry
-- and the snapshot of that migration. Destroys the capital ledger of every tenant: only for a
-- throwaway database (ledgers are never rolled back by deleting rows in production).
DROP TRIGGER "capital_movements_append_only" ON "capital_movements";
DROP FUNCTION "capital_movements_reject_change"();
DROP TABLE "capital_movements";
