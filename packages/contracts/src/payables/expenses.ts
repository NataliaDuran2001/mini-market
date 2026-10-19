// Expense contracts of the payables module (issue #40, rules S5 and S9). Owner only: no employee
// ever receives these shapes (docs/01-domain.md section 4).
import { z } from 'zod';
import { moneySchema, uuidSchema } from '../common/index.js';

export const EXPENSE_STATUSES = ['pending', 'partial', 'paid'] as const;
export const MAX_EXPENSE_NAME_LENGTH = 120;
export const MAX_EXPENSE_NOTES_LENGTH = 500;

export const expenseStatusSchema = z.enum(EXPENSE_STATUSES);

/** "YYYY-MM": the month an expense belongs to in the tenant timezone (S5). */
export const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM');

/** A real calendar day, "YYYY-MM-DD". */
const dayKeySchema = z.iso.date();

const nameSchema = z.string().trim().min(1).max(MAX_EXPENSE_NAME_LENGTH);
const positiveMoney = moneySchema.positive();
/** An empty note is stored as no note. */
const notesSchema = z.string().trim().max(MAX_EXPENSE_NOTES_LENGTH);

export const expenseSchema = z.object({
  id: uuidSchema,
  expenseCategoryId: uuidSchema,
  /** The template that generated it, or null for a one-off expense. */
  recurringExpenseId: uuidSchema.nullable(),
  name: z.string(),
  amountCentavos: positiveMoney,
  period: periodSchema,
  dueDate: dayKeySchema.nullable(),
  status: expenseStatusSchema,
  paidCentavos: moneySchema.min(0),
  /** `amountCentavos - paidCentavos`. */
  balanceCentavos: moneySchema.min(0),
  notes: z.string().nullable(),
});

/**
 * `POST /api/v1/expenses`. `period` is the month the expense belongs to (S5); `dueDate` is
 * independent of it: rent of October due on November 5 has period 2026-10 and dueDate 2026-11-05.
 */
export const createExpenseRequestSchema = z.strictObject({
  expenseCategoryId: uuidSchema,
  name: nameSchema,
  amountCentavos: positiveMoney,
  period: periodSchema,
  dueDate: dayKeySchema.nullable().optional(),
  notes: notesSchema.optional(),
});

const EXPENSE_UPDATE_KEYS = ['expenseCategoryId', 'name', 'amountCentavos', 'dueDate', 'notes'];

/**
 * `PATCH /api/v1/expenses/:id`. The amount changes only while the expense is not paid (409
 * otherwise) and never below what was already paid. The period does not change.
 */
export const updateExpenseRequestSchema = z
  .strictObject({
    expenseCategoryId: uuidSchema.optional(),
    name: nameSchema.optional(),
    amountCentavos: positiveMoney.optional(),
    dueDate: dayKeySchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine((body) => EXPENSE_UPDATE_KEYS.some((key) => key in body), {
    message: 'Send at least one field to change',
  });

/** `POST /api/v1/expenses/:id/payments`: a partial or total payment; `paidOn` defaults to today. */
export const payExpenseRequestSchema = z.strictObject({
  amountCentavos: positiveMoney,
  paymentMethodId: uuidSchema,
  paidOn: dayKeySchema.optional(),
});

/** `GET /api/v1/expenses?period=2026-10`. Viewing a period generates its recurring expenses. */
export const listExpensesQuerySchema = z.object({
  period: periodSchema,
  status: expenseStatusSchema.optional(),
  categoryId: uuidSchema.optional(),
});

/** Totals of the whole period (S2): accrued by period, paid so far, still pending. */
export const expenseTotalsSchema = z.object({
  accruedCentavos: moneySchema.min(0),
  paidCentavos: moneySchema.min(0),
  pendingCentavos: moneySchema.min(0),
});

export const listExpensesResponseSchema = z.object({
  period: periodSchema,
  items: z.array(expenseSchema),
  /** Of every expense of the period, whatever the filters. */
  totals: expenseTotalsSchema,
});

export const recurringExpenseSchema = z.object({
  id: uuidSchema,
  expenseCategoryId: uuidSchema,
  name: z.string(),
  amountCentavos: positiveMoney,
  /** 1 to 31; a shorter month uses its last day. */
  dayOfMonthDue: z.number().int().min(1).max(31),
  active: z.boolean(),
  startsPeriod: periodSchema,
  endsPeriod: periodSchema.nullable(),
});

const dayOfMonthSchema = z.number().int().min(1).max(31);

/** `POST /api/v1/recurring-expenses` */
export const createRecurringExpenseRequestSchema = z.strictObject({
  expenseCategoryId: uuidSchema,
  name: nameSchema,
  amountCentavos: positiveMoney,
  dayOfMonthDue: dayOfMonthSchema,
  startsPeriod: periodSchema,
  endsPeriod: periodSchema.nullable().optional(),
  active: z.boolean().optional(),
});

const RECURRING_UPDATE_KEYS = [
  'expenseCategoryId',
  'name',
  'amountCentavos',
  'dayOfMonthDue',
  'startsPeriod',
  'endsPeriod',
  'active',
];

/** `PATCH /api/v1/recurring-expenses/:id`. Expenses already generated keep their own values. */
export const updateRecurringExpenseRequestSchema = z
  .strictObject({
    expenseCategoryId: uuidSchema.optional(),
    name: nameSchema.optional(),
    amountCentavos: positiveMoney.optional(),
    dayOfMonthDue: dayOfMonthSchema.optional(),
    startsPeriod: periodSchema.optional(),
    endsPeriod: periodSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((body) => RECURRING_UPDATE_KEYS.some((key) => key in body), {
    message: 'Send at least one field to change',
  });

export const listRecurringExpensesResponseSchema = z.object({
  items: z.array(recurringExpenseSchema),
});

export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseStatus = z.infer<typeof expenseStatusSchema>;
export type CreateExpenseRequest = z.input<typeof createExpenseRequestSchema>;
export type UpdateExpenseRequest = z.input<typeof updateExpenseRequestSchema>;
export type PayExpenseRequest = z.input<typeof payExpenseRequestSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type ExpenseTotals = z.infer<typeof expenseTotalsSchema>;
export type ListExpensesResponse = z.infer<typeof listExpensesResponseSchema>;
export type RecurringExpense = z.infer<typeof recurringExpenseSchema>;
export type CreateRecurringExpenseRequest = z.input<typeof createRecurringExpenseRequestSchema>;
export type UpdateRecurringExpenseRequest = z.input<typeof updateRecurringExpenseRequestSchema>;
export type ListRecurringExpensesResponse = z.infer<typeof listRecurringExpensesResponseSchema>;
