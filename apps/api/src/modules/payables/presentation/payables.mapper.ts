import type {
  Expense as ExpenseDto,
  ListExpensesResponse,
  RecurringExpense as RecurringExpenseDto,
} from '@mini-market/contracts/payables';
import type { Money } from '@mini-market/shared-kernel';
import type { ExpensesView } from '../application/list-expenses';
import { balanceOf } from '../application/views';
import type { Expense, RecurringExpense } from '../application/views';

/**
 * Wire money is a safe integer of centavos (`moneySchema`); the response schema checks it. An
 * amount above Number.MAX_SAFE_INTEGER (about Bs 90 trillion) is out of range by decision.
 */
const centavos = (money: Money): number => Number(money.toCentavos());

export const toExpenseDto = (expense: Expense): ExpenseDto => ({
  id: expense.id,
  expenseCategoryId: expense.expenseCategoryId,
  recurringExpenseId: expense.recurringExpenseId,
  name: expense.name,
  amountCentavos: centavos(expense.amount),
  period: expense.period.toString(),
  dueDate: expense.dueDate,
  status: expense.status,
  paidCentavos: centavos(expense.paid),
  balanceCentavos: centavos(balanceOf(expense)),
  notes: expense.notes,
});

export const toExpensesDto = (view: ExpensesView): ListExpensesResponse => ({
  period: view.period.toString(),
  items: view.items.map(toExpenseDto),
  totals: {
    accruedCentavos: centavos(view.totals.accrued),
    paidCentavos: centavos(view.totals.paid),
    pendingCentavos: centavos(view.totals.pending),
  },
});

export const toRecurringDto = (template: RecurringExpense): RecurringExpenseDto => ({
  id: template.id,
  expenseCategoryId: template.expenseCategoryId,
  name: template.name,
  amountCentavos: centavos(template.amount),
  dayOfMonthDue: template.dayOfMonthDue,
  active: template.active,
  startsPeriod: template.startsPeriod.toString(),
  endsPeriod: template.endsPeriod?.toString() ?? null,
});
