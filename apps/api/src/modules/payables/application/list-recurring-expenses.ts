import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { RecurringExpense } from '../domain/recurring-expense';
import type { RecurringExpenseRepository } from './ports/recurring-expense.repository';

export const LIST_RECURRING_EXPENSES = Symbol('LIST_RECURRING_EXPENSES');

export type ListRecurringExpenses = (
  ctx: TenantContext,
) => Promise<Result<readonly RecurringExpense[], DomainError>>;

export interface ListRecurringExpensesDeps {
  readonly recurring: RecurringExpenseRepository;
  readonly withTransaction: WithTransaction;
}

/** Owner only: every template, active or not, by name. */
export async function listRecurringExpenses(
  deps: ListRecurringExpensesDeps,
  ctx: TenantContext,
): Promise<Result<readonly RecurringExpense[], DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  return ok(await deps.withTransaction(ctx, (tx) => deps.recurring.list(tx, ctx.tenantId)));
}
