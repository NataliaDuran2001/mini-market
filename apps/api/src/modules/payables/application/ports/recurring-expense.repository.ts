import type { Money, Period } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type { RecurringExpense } from '../../domain/recurring-expense';

export interface NewRecurringExpense {
  readonly expenseCategoryId: string;
  readonly name: string;
  readonly amount: Money;
  readonly dayOfMonthDue: number;
  readonly active: boolean;
  readonly startsPeriod: Period;
  readonly endsPeriod: Period | null;
  readonly createdBy: string;
}

/** The fields an update may change; a missing key keeps the stored value. */
export interface RecurringExpensePatch {
  readonly expenseCategoryId?: string;
  readonly name?: string;
  readonly amount?: Money;
  readonly dayOfMonthDue?: number;
  readonly active?: boolean;
  readonly startsPeriod?: Period;
  readonly endsPeriod?: Period | null;
}

/** Recurring expense templates of a tenant; every method takes `tenantId` (see ExpenseRepository). */
export interface RecurringExpenseRepository {
  insert(
    tx: Transaction,
    tenantId: string,
    template: NewRecurringExpense,
  ): Promise<RecurringExpense>;

  findById(tx: Transaction, tenantId: string, id: string): Promise<RecurringExpense | null>;

  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: RecurringExpensePatch,
  ): Promise<RecurringExpense | null>;

  /** Every template, by name. */
  list(tx: Transaction, tenantId: string): Promise<readonly RecurringExpense[]>;

  /** The templates that are switched on; the period range is decided by the domain. */
  listActive(tx: Transaction, tenantId: string): Promise<readonly RecurringExpense[]>;
}
