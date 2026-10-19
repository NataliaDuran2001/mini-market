-- Rollback of 20261019055721_receivables_customers_ledger. Run by hand, then remove the journal entry
-- and the snapshot of that migration. Destroys the customers and the credit ledger of every tenant:
-- only for a throwaway database (ledgers are never rolled back by deleting rows in production).
DROP TRIGGER "credit_ledger_append_only" ON "credit_ledger";
DROP FUNCTION "credit_ledger_reject_change"();
DROP TABLE "credit_ledger";
DROP TABLE "customers";
