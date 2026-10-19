// Drizzle tables of the payables module. Re-exported by src/infrastructure/db/schema.ts.
// Money is integer centavos in bigint columns (ADR 0004). Nothing here is ever deleted: a template
// is switched off with `active`, and payments are append-only (`app_user` has no UPDATE or DELETE).
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';
import { expenseCategories, paymentMethods } from '../../catalog/infrastructure/schema';

// Inlined with sql.raw: a bound parameter is not allowed inside a CHECK constraint.
const PERIOD_FORMAT = sql.raw(String.raw`'^\d{4}-(0[1-9]|1[0-2])$'`);

/** Fixed monthly costs (rent, utilities, salaries) that generate one expense per period (S5). */
export const recurringExpenses = tenantTable(
  'recurring_expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    expenseCategoryId: uuid()
      .notNull()
      .references(() => expenseCategories.id),
    name: text().notNull(),
    amountCentavos: bigint({ mode: 'bigint' }).notNull(),
    dayOfMonthDue: integer().notNull(),
    active: boolean().notNull().default(true),
    /** "YYYY-MM"; text sorts like the calendar. */
    startsPeriod: text().notNull(),
    endsPeriod: text(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('recurring_expenses_name_check', sql`length(btrim(${table.name})) > 0`),
    check('recurring_expenses_amount_check', sql`${table.amountCentavos} > 0`),
    check('recurring_expenses_day_check', sql`${table.dayOfMonthDue} between 1 and 31`),
    check(
      'recurring_expenses_period_check',
      sql`${table.startsPeriod} ~ ${PERIOD_FORMAT} and (${table.endsPeriod} is null or (${table.endsPeriod} ~ ${PERIOD_FORMAT} and ${table.endsPeriod} >= ${table.startsPeriod}))`,
    ),
  ],
);

/**
 * An expense accrues to `period_year`/`period_month` whatever its due or payment date (S5). One
 * template generates at most one expense per period: the partial unique index makes the
 * generation idempotent even under concurrent requests.
 */
export const expenses = tenantTable(
  'expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    expenseCategoryId: uuid()
      .notNull()
      .references(() => expenseCategories.id),
    recurringExpenseId: uuid().references(() => recurringExpenses.id),
    name: text().notNull(),
    amountCentavos: bigint({ mode: 'bigint' }).notNull(),
    periodYear: integer().notNull(),
    periodMonth: integer().notNull(),
    dueDate: date({ mode: 'string' }),
    status: text().notNull().default('pending'),
    paidCentavos: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    notes: text(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('expenses_name_check', sql`length(btrim(${table.name})) > 0`),
    check('expenses_amount_check', sql`${table.amountCentavos} > 0`),
    check('expenses_month_check', sql`${table.periodMonth} between 1 and 12`),
    check(
      'expenses_paid_check',
      sql`${table.paidCentavos} >= 0 and ${table.paidCentavos} <= ${table.amountCentavos}`,
    ),
    check(
      'expenses_status_check',
      sql`(${table.status} = 'pending' and ${table.paidCentavos} = 0)
        or (${table.status} = 'partial' and ${table.paidCentavos} > 0 and ${table.paidCentavos} < ${table.amountCentavos})
        or (${table.status} = 'paid' and ${table.paidCentavos} = ${table.amountCentavos})`,
    ),
    index('expenses_tenant_period_idx').on(table.tenantId, table.periodYear, table.periodMonth),
    uniqueIndex('expenses_recurring_period_idx')
      .on(table.tenantId, table.recurringExpenseId, table.periodYear, table.periodMonth)
      .where(sql`${table.recurringExpenseId} is not null`),
  ],
);

/** Money out against an expense. Append-only. */
export const expensePayments = tenantTable(
  'expense_payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    expenseId: uuid()
      .notNull()
      .references(() => expenses.id),
    amountCentavos: bigint({ mode: 'bigint' }).notNull(),
    paidAt: date({ mode: 'string' }).notNull(),
    paymentMethodId: uuid()
      .notNull()
      .references(() => paymentMethods.id),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('expense_payments_amount_check', sql`${table.amountCentavos} > 0`),
    index('expense_payments_expense_idx').on(table.tenantId, table.expenseId),
  ],
);
