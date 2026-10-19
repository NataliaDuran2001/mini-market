/** Injection tokens of the payables module ports. `payables.module.ts` binds them. */
export const CATALOG_LOOKUP = Symbol('CATALOG_LOOKUP');
export const EXPENSE_REPOSITORY = Symbol('EXPENSE_REPOSITORY');
export const RECURRING_EXPENSE_REPOSITORY = Symbol('RECURRING_EXPENSE_REPOSITORY');
