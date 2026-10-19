import type { Money, Period } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type { Expense, ExpensePayment, ExpenseStatus } from '../../domain/expense';

export interface NewExpense {
  readonly expenseCategoryId: string;
  readonly recurringExpenseId: string | null;
  readonly name: string;
  readonly amount: Money;
  readonly period: Period;
  readonly dueDate: string | null;
  readonly notes: string | null;
  readonly createdBy: string;
}

/** The fields an update may change; a missing key keeps the stored value. */
export interface ExpensePatch {
  readonly expenseCategoryId?: string;
  readonly name?: string;
  readonly amount?: Money;
  readonly dueDate?: string | null;
  readonly notes?: string | null;
  readonly paid?: Money;
  readonly status?: ExpenseStatus;
}

/**
 * Expenses of a tenant. Every method takes `tenantId` and puts it in the query, so a wrong id can
 * only miss, never reach another tenant; row level security is the second wall.
 */
export interface ExpenseRepository {
  insert(tx: Transaction, tenantId: string, expense: NewExpense): Promise<Expense>;

  /**
   * Inserts expenses generated from templates. A template that already has an expense in that
   * period is skipped (idempotent, also under concurrent requests). Returns how many were created.
   */
  insertGenerated(
    tx: Transaction,
    tenantId: string,
    expenses: readonly NewExpense[],
  ): Promise<number>;

  /** The expense, locked until the transaction ends so two payments cannot both pass the balance check. */
  findForUpdate(tx: Transaction, tenantId: string, id: string): Promise<Expense | null>;

  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ExpensePatch,
  ): Promise<Expense | null>;

  /** Every expense of the period, by due date (none last) then name. */
  listByPeriod(tx: Transaction, tenantId: string, period: Period): Promise<readonly Expense[]>;

  insertPayment(tx: Transaction, tenantId: string, payment: ExpensePayment): Promise<void>;

  listPayments(
    tx: Transaction,
    tenantId: string,
    expenseId: string,
  ): Promise<readonly ExpensePayment[]>;
}
