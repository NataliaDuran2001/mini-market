-- Rollback of 20261019051639_payables_expenses. Run by hand, then remove the journal entry and the
-- snapshot of that migration. Destroys every expense and payment: only for a throwaway database.
DROP TABLE "expense_payments";
DROP TABLE "expenses";
DROP TABLE "recurring_expenses";
