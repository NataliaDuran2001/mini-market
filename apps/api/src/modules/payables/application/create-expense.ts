import type { CreateExpenseRequest } from '@mini-market/contracts/payables';
import { Money, Period, err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { Expense } from '../domain/expense';
import { checkExpenseCategory } from './catalog-checks';
import type { CatalogLookup } from './ports/catalog-lookup.port';
import type { ExpenseRepository } from './ports/expense.repository';

export const CREATE_EXPENSE = Symbol('CREATE_EXPENSE');

export type CreateExpense = (
  ctx: TenantContext,
  input: CreateExpenseRequest,
) => Promise<Result<Expense, DomainError>>;

export interface CreateExpenseDeps {
  readonly expenses: ExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly withTransaction: WithTransaction;
}

/**
 * S5: a one-off expense belongs to the month the owner picks, whatever its due date. Owner only.
 * Nothing is paid yet; payments come through `payExpense`.
 */
export async function createExpense(
  deps: CreateExpenseDeps,
  ctx: TenantContext,
  input: CreateExpenseRequest,
): Promise<Result<Expense, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  const period = Period.parse(input.period);
  if (!period.ok) return period;

  return deps.withTransaction(ctx, async (tx): Promise<Result<Expense, DomainError>> => {
    const category = await checkExpenseCategory(
      deps.catalog,
      tx,
      ctx.tenantId,
      input.expenseCategoryId,
    );
    if (!category.ok) return err(category.error);
    const expense = await deps.expenses.insert(tx, ctx.tenantId, {
      expenseCategoryId: input.expenseCategoryId,
      recurringExpenseId: null,
      name: input.name,
      amount: Money.fromCentavos(input.amountCentavos),
      period: period.value,
      dueDate: input.dueDate ?? null,
      notes: input.notes === undefined || input.notes === '' ? null : input.notes,
      createdBy: ctx.userId,
    });
    return ok(expense);
  });
}
