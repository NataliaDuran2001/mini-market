import type { ListExpensesQuery } from '@mini-market/contracts/payables';
import { Period, err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { totalsOf } from '../domain/expense';
import type { Expense, ExpenseTotals } from '../domain/expense';
import { ensurePeriodGenerated } from './ensure-period-generated';
import type { EnsurePeriodGeneratedDeps } from './ensure-period-generated';

export const LIST_EXPENSES = Symbol('LIST_EXPENSES');

export interface ExpensesView {
  readonly period: Period;
  readonly items: readonly Expense[];
  /** Of every expense of the period, whatever the filters (S2). */
  readonly totals: ExpenseTotals;
}

export type ListExpenses = (
  ctx: TenantContext,
  query: ListExpensesQuery,
) => Promise<Result<ExpensesView, DomainError>>;

export interface ListExpensesDeps extends EnsurePeriodGeneratedDeps {
  readonly withTransaction: WithTransaction;
}

/**
 * Owner only. Viewing a period first generates its recurring expenses (`ensurePeriodGenerated`,
 * idempotent), then lists what accrued in it (S5) with the totals accrued, paid and pending.
 */
export async function listExpenses(
  deps: ListExpensesDeps,
  ctx: TenantContext,
  query: ListExpensesQuery,
): Promise<Result<ExpensesView, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  const period = Period.parse(query.period);
  if (!period.ok) return err(period.error);

  const all = await deps.withTransaction(ctx, async (tx) => {
    await ensurePeriodGenerated(deps, tx, ctx.tenantId, period.value);
    return deps.expenses.listByPeriod(tx, ctx.tenantId, period.value);
  });
  const items = all.filter(
    (expense) =>
      (query.status === undefined || expense.status === query.status) &&
      (query.categoryId === undefined || expense.expenseCategoryId === query.categoryId),
  );
  return ok({ period: period.value, items, totals: totalsOf(all) });
}
