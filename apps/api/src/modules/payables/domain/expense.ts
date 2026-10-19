// Expenses (S5, S9): accrued by period, paid in one or more payments. Pure TypeScript.
import { Money, err, ok } from '@mini-market/shared-kernel';
import type { Period, Result } from '@mini-market/shared-kernel';
import { AmountBelowPaidError, ExpensePaidError, PaymentExceedsBalanceError } from './errors';

export type ExpenseStatus = 'pending' | 'partial' | 'paid';

export interface Expense {
  readonly id: string;
  readonly tenantId: string;
  readonly expenseCategoryId: string;
  /** The template that generated it, or null for a one-off expense. */
  readonly recurringExpenseId: string | null;
  readonly name: string;
  readonly amount: Money;
  /** S5: the month it belongs to. Reports subtract by this, never by when it was paid. */
  readonly period: Period;
  /** "YYYY-MM-DD", independent of the period (October rent can be due on November 5). */
  readonly dueDate: string | null;
  readonly status: ExpenseStatus;
  readonly paid: Money;
  readonly notes: string | null;
}

export interface ExpensePayment {
  readonly expenseId: string;
  readonly amount: Money;
  /** "YYYY-MM-DD" in the tenant timezone. */
  readonly paidAt: string;
  readonly paymentMethodId: string;
  readonly createdBy: string;
}

/** `amount - paid`. */
export const balanceOf = (expense: Pick<Expense, 'amount' | 'paid'>): Money =>
  expense.amount.subtract(expense.paid);

/** pending: nothing paid; partial: something paid; paid: the whole amount. */
export function statusFor(amount: Money, paid: Money): ExpenseStatus {
  if (paid.compare(Money.zero()) === 0) return 'pending';
  return paid.compare(amount) >= 0 ? 'paid' : 'partial';
}

export interface Settlement {
  readonly paid: Money;
  readonly status: ExpenseStatus;
}

/** Applies a payment: it may not exceed the balance. Partial payments are allowed (S9). */
export function registerPayment(
  expense: Pick<Expense, 'amount' | 'paid'>,
  payment: Money,
): Result<Settlement, PaymentExceedsBalanceError> {
  const balance = balanceOf(expense);
  if (payment.compare(balance) > 0) {
    return err(
      new PaymentExceedsBalanceError('The payment exceeds the balance of the expense', {
        balanceCentavos: Number(balance.toCentavos()),
      }),
    );
  }
  const paid = expense.paid.add(payment);
  return ok({ paid, status: statusFor(expense.amount, paid) });
}

/**
 * Changes the amount of an expense that is not paid yet, and never to less than was already paid.
 * An expense whose amount equals what was paid becomes `paid`.
 */
export function changeAmount(
  expense: Pick<Expense, 'status' | 'paid'>,
  amount: Money,
): Result<Settlement, ExpensePaidError | AmountBelowPaidError> {
  if (expense.status === 'paid') {
    return err(new ExpensePaidError('The amount of a paid expense cannot change'));
  }
  if (amount.compare(expense.paid) < 0) {
    return err(
      new AmountBelowPaidError('The amount cannot be lower than what was already paid', {
        paidCentavos: Number(expense.paid.toCentavos()),
      }),
    );
  }
  return ok({ paid: expense.paid, status: statusFor(amount, expense.paid) });
}

export interface ExpenseTotals {
  readonly accrued: Money;
  readonly paid: Money;
  readonly pending: Money;
}

/** S2: totals of the expenses of one period. */
export function totalsOf(expenses: readonly Pick<Expense, 'amount' | 'paid'>[]): ExpenseTotals {
  const accrued = expenses.reduce((sum, expense) => sum.add(expense.amount), Money.zero());
  const paid = expenses.reduce((sum, expense) => sum.add(expense.paid), Money.zero());
  return { accrued, paid, pending: accrued.subtract(paid) };
}
