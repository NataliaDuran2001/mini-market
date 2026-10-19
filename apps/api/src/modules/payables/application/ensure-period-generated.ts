import type { Period } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import { dueDateFor, generatesFor } from '../domain/recurring-expense';
import type { ExpenseRepository } from './ports/expense.repository';
import type { RecurringExpenseRepository } from './ports/recurring-expense.repository';

export interface EnsurePeriodGeneratedDeps {
  readonly expenses: ExpenseRepository;
  readonly recurring: RecurringExpenseRepository;
}

/**
 * S5: one expense per active template and period, due on the template's day. Idempotent: a period
 * that already has the expense of a template gets no second one, however often or however
 * concurrently this runs. Nothing is read from a global: the transaction carries the tenant.
 * @returns how many expenses were created
 */
export async function ensurePeriodGenerated(
  deps: EnsurePeriodGeneratedDeps,
  tx: Transaction,
  tenantId: string,
  period: Period,
): Promise<number> {
  const templates = (await deps.recurring.listActive(tx, tenantId)).filter((template) =>
    generatesFor(template, period),
  );
  if (templates.length === 0) return 0;
  return deps.expenses.insertGenerated(
    tx,
    tenantId,
    templates.map((template) => ({
      expenseCategoryId: template.expenseCategoryId,
      recurringExpenseId: template.id,
      name: template.name,
      amount: template.amount,
      period,
      dueDate: dueDateFor(period, template.dayOfMonthDue),
      notes: null,
      createdBy: template.createdBy,
    })),
  );
}
