import { DomainError } from '@mini-market/shared-kernel';

export class ExpenseNotFoundError extends DomainError {
  readonly code = 'EXPENSE_NOT_FOUND';
  readonly httpStatus = 404;
}

export class RecurringExpenseNotFoundError extends DomainError {
  readonly code = 'RECURRING_EXPENSE_NOT_FOUND';
  readonly httpStatus = 404;
}

/** The amount of a paid expense does not change: what was paid is a fact (S5, S9). */
export class ExpensePaidError extends DomainError {
  readonly code = 'EXPENSE_PAID';
  readonly httpStatus = 409;
}

/** A new amount below what was already paid would leave a negative balance. */
export class AmountBelowPaidError extends DomainError {
  readonly code = 'AMOUNT_BELOW_PAID';
  readonly httpStatus = 409;
}

/** A payment larger than the balance (an expense already paid has a balance of zero). */
export class PaymentExceedsBalanceError extends DomainError {
  readonly code = 'PAYMENT_EXCEEDS_BALANCE';
  readonly httpStatus = 400;
}

/** The expense category or payment method is unknown to the tenant or switched off. */
export class InvalidCatalogItemError extends DomainError {
  readonly code = 'INVALID_CATALOG_ITEM';
  readonly httpStatus = 400;
}

/** A template that ends before it starts. */
export class InvalidScheduleError extends DomainError {
  readonly code = 'INVALID_SCHEDULE';
  readonly httpStatus = 400;
}
