import { Module } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { AUDIT_PORT, permissionsProvider } from '../access';
import type { AuditPort } from '../access';
import { CREATE_EXPENSE, createExpense } from './application/create-expense';
import {
  CREATE_RECURRING_EXPENSE,
  createRecurringExpense,
} from './application/create-recurring-expense';
import {
  GENERATE_EXPENSES_FOR_PERIOD,
  generateExpensesForPeriod,
} from './application/generate-expenses-for-period';
import { LIST_EXPENSES, listExpenses } from './application/list-expenses';
import {
  LIST_RECURRING_EXPENSES,
  listRecurringExpenses,
} from './application/list-recurring-expenses';
import { PAY_EXPENSE, payExpense } from './application/pay-expense';
import type { CatalogLookup } from './application/ports/catalog-lookup.port';
import type { ExpenseRepository } from './application/ports/expense.repository';
import type { RecurringExpenseRepository } from './application/ports/recurring-expense.repository';
import {
  CATALOG_LOOKUP,
  EXPENSE_REPOSITORY,
  RECURRING_EXPENSE_REPOSITORY,
} from './application/tokens';
import { UPDATE_EXPENSE, updateExpense } from './application/update-expense';
import {
  UPDATE_RECURRING_EXPENSE,
  updateRecurringExpense,
} from './application/update-recurring-expense';
import { CatalogModuleLookup } from './infrastructure/catalog-lookup.adapter';
import { DrizzleExpenseRepository } from './infrastructure/drizzle-expense.repository';
import { DrizzleRecurringExpenseRepository } from './infrastructure/drizzle-recurring-expense.repository';
import { PAYABLES_PERMISSIONS } from './payables.permissions';
import { ExpensesController } from './presentation/expenses.controller';
import { RecurringExpensesController } from './presentation/recurring-expenses.controller';

/** The ports and services the use cases of this module are built from. */
interface Deps {
  readonly expenses: ExpenseRepository;
  readonly recurring: RecurringExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

const DEPS_INJECT = [
  EXPENSE_REPOSITORY,
  RECURRING_EXPENSE_REPOSITORY,
  CATALOG_LOOKUP,
  AUDIT_PORT,
  CLOCK,
  WITH_TRANSACTION,
];

/** Binds one use case to the module dependencies; each use case takes only the ones it names. */
const useCase = (token: symbol, build: (deps: Deps) => unknown): Provider => ({
  provide: token,
  useFactory: (
    expenses: ExpenseRepository,
    recurring: RecurringExpenseRepository,
    catalog: CatalogLookup,
    audit: AuditPort,
    clock: Clock,
    withTransaction: WithTransaction,
  ) => build({ expenses, recurring, catalog, audit, clock, withTransaction }),
  inject: DEPS_INJECT,
});

@Module({
  controllers: [ExpensesController, RecurringExpensesController],
  providers: [
    permissionsProvider('payables', PAYABLES_PERMISSIONS),
    { provide: EXPENSE_REPOSITORY, useFactory: () => new DrizzleExpenseRepository() },
    {
      provide: RECURRING_EXPENSE_REPOSITORY,
      useFactory: () => new DrizzleRecurringExpenseRepository(),
    },
    { provide: CATALOG_LOOKUP, useFactory: () => new CatalogModuleLookup() },
    useCase(LIST_EXPENSES, (deps) => listExpenses.bind(null, deps)),
    useCase(CREATE_EXPENSE, (deps) => createExpense.bind(null, deps)),
    useCase(UPDATE_EXPENSE, (deps) => updateExpense.bind(null, deps)),
    useCase(PAY_EXPENSE, (deps) => payExpense.bind(null, deps)),
    useCase(LIST_RECURRING_EXPENSES, (deps) => listRecurringExpenses.bind(null, deps)),
    useCase(CREATE_RECURRING_EXPENSE, (deps) => createRecurringExpense.bind(null, deps)),
    useCase(UPDATE_RECURRING_EXPENSE, (deps) => updateRecurringExpense.bind(null, deps)),
    useCase(GENERATE_EXPENSES_FOR_PERIOD, (deps) => generateExpensesForPeriod.bind(null, deps)),
  ],
  exports: [GENERATE_EXPENSES_FOR_PERIOD],
})
export class PayablesModule {}
