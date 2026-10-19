import type { CreateRecurringExpenseRequest } from '@mini-market/contracts/payables';
import { Money, Period, err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { checkSchedule } from '../domain/recurring-expense';
import type { RecurringExpense } from '../domain/recurring-expense';
import { checkExpenseCategory } from './catalog-checks';
import type { CatalogLookup } from './ports/catalog-lookup.port';
import type { RecurringExpenseRepository } from './ports/recurring-expense.repository';

export const CREATE_RECURRING_EXPENSE = Symbol('CREATE_RECURRING_EXPENSE');

export type CreateRecurringExpense = (
  ctx: TenantContext,
  input: CreateRecurringExpenseRequest,
) => Promise<Result<RecurringExpense, DomainError>>;

export interface CreateRecurringExpenseDeps {
  readonly recurring: RecurringExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly withTransaction: WithTransaction;
}

/** Owner only. The template generates its expenses lazily, when a period is first viewed (S5). */
export async function createRecurringExpense(
  deps: CreateRecurringExpenseDeps,
  ctx: TenantContext,
  input: CreateRecurringExpenseRequest,
): Promise<Result<RecurringExpense, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  const startsPeriod = Period.parse(input.startsPeriod);
  if (!startsPeriod.ok) return startsPeriod;
  const endsPeriod = input.endsPeriod == null ? ok(null) : Period.parse(input.endsPeriod);
  if (!endsPeriod.ok) return endsPeriod;
  const schedule = checkSchedule(startsPeriod.value, endsPeriod.value);
  if (!schedule.ok) return schedule;

  return deps.withTransaction(ctx, async (tx): Promise<Result<RecurringExpense, DomainError>> => {
    const category = await checkExpenseCategory(
      deps.catalog,
      tx,
      ctx.tenantId,
      input.expenseCategoryId,
    );
    if (!category.ok) return err(category.error);
    return ok(
      await deps.recurring.insert(tx, ctx.tenantId, {
        expenseCategoryId: input.expenseCategoryId,
        name: input.name,
        amount: Money.fromCentavos(input.amountCentavos),
        dayOfMonthDue: input.dayOfMonthDue,
        active: input.active ?? true,
        startsPeriod: startsPeriod.value,
        endsPeriod: endsPeriod.value,
        createdBy: ctx.userId,
      }),
    );
  });
}
