import type { UpdateRecurringExpenseRequest } from '@mini-market/contracts/payables';
import { Money, Period, err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { RecurringExpenseNotFoundError } from '../domain/errors';
import { checkSchedule } from '../domain/recurring-expense';
import type { RecurringExpense } from '../domain/recurring-expense';
import { checkExpenseCategory } from './catalog-checks';
import type { CatalogLookup } from './ports/catalog-lookup.port';
import type {
  RecurringExpensePatch,
  RecurringExpenseRepository,
} from './ports/recurring-expense.repository';

export const UPDATE_RECURRING_EXPENSE = Symbol('UPDATE_RECURRING_EXPENSE');

export type UpdateRecurringExpense = (
  ctx: TenantContext,
  id: string,
  input: UpdateRecurringExpenseRequest,
) => Promise<Result<RecurringExpense, DomainError>>;

export interface UpdateRecurringExpenseDeps {
  readonly recurring: RecurringExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly withTransaction: WithTransaction;
}

function toPatch(
  input: UpdateRecurringExpenseRequest,
  startsPeriod: Period | undefined,
  endsPeriod: Period | null | undefined,
): RecurringExpensePatch {
  return {
    ...(input.expenseCategoryId !== undefined
      ? { expenseCategoryId: input.expenseCategoryId }
      : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.amountCentavos !== undefined
      ? { amount: Money.fromCentavos(input.amountCentavos) }
      : {}),
    ...(input.dayOfMonthDue !== undefined ? { dayOfMonthDue: input.dayOfMonthDue } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(startsPeriod !== undefined ? { startsPeriod } : {}),
    ...(endsPeriod !== undefined ? { endsPeriod } : {}),
  };
}

/**
 * Owner only. Expenses already generated keep their own values: the template only decides the
 * periods that are generated from now on. Switching `active` off stops future periods.
 */
export async function updateRecurringExpense(
  deps: UpdateRecurringExpenseDeps,
  ctx: TenantContext,
  id: string,
  input: UpdateRecurringExpenseRequest,
): Promise<Result<RecurringExpense, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  const startsPeriod =
    input.startsPeriod === undefined ? ok(undefined) : Period.parse(input.startsPeriod);
  if (!startsPeriod.ok) return startsPeriod;
  const endsPeriod =
    input.endsPeriod === undefined || input.endsPeriod === null
      ? ok(input.endsPeriod)
      : Period.parse(input.endsPeriod);
  if (!endsPeriod.ok) return endsPeriod;

  return deps.withTransaction(ctx, async (tx): Promise<Result<RecurringExpense, DomainError>> => {
    const current = await deps.recurring.findById(tx, ctx.tenantId, id);
    if (!current) return err(new RecurringExpenseNotFoundError('Recurring expense not found'));
    if (input.expenseCategoryId !== undefined) {
      const category = await checkExpenseCategory(
        deps.catalog,
        tx,
        ctx.tenantId,
        input.expenseCategoryId,
      );
      if (!category.ok) return err(category.error);
    }
    const schedule = checkSchedule(
      startsPeriod.value ?? current.startsPeriod,
      endsPeriod.value === undefined ? current.endsPeriod : endsPeriod.value,
    );
    if (!schedule.ok) return err(schedule.error);
    const updated = await deps.recurring.update(
      tx,
      ctx.tenantId,
      id,
      toPatch(input, startsPeriod.value, endsPeriod.value),
    );
    return updated
      ? ok(updated)
      : err(new RecurringExpenseNotFoundError('Recurring expense not found'));
  });
}
