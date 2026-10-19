import type { UpdateExpenseRequest } from '@mini-market/contracts/payables';
import { Money, err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import { changeAmount } from '../domain/expense';
import type { Expense } from '../domain/expense';
import { ExpenseNotFoundError } from '../domain/errors';
import { checkExpenseCategory } from './catalog-checks';
import type { CatalogLookup } from './ports/catalog-lookup.port';
import type { ExpensePatch, ExpenseRepository } from './ports/expense.repository';

export const UPDATE_EXPENSE = Symbol('UPDATE_EXPENSE');

export type UpdateExpense = (
  ctx: TenantContext,
  id: string,
  input: UpdateExpenseRequest,
) => Promise<Result<Expense, DomainError>>;

export interface UpdateExpenseDeps {
  readonly expenses: ExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Fields other than the amount; a blank note clears it. */
function plainPatch(input: UpdateExpenseRequest): ExpensePatch {
  return {
    ...(input.expenseCategoryId !== undefined
      ? { expenseCategoryId: input.expenseCategoryId }
      : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    ...(input.notes !== undefined ? { notes: input.notes === '' ? null : input.notes } : {}),
  };
}

/**
 * Owner only. The amount changes only while the expense is not paid (S5, S9) and never below what
 * was already paid; each amount change is audited. Name, category, due date and notes can change
 * at any time. The period never changes.
 */
export async function updateExpense(
  deps: UpdateExpenseDeps,
  ctx: TenantContext,
  id: string,
  input: UpdateExpenseRequest,
): Promise<Result<Expense, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx): Promise<Result<Expense, DomainError>> => {
    const current = await deps.expenses.findForUpdate(tx, ctx.tenantId, id);
    if (!current) return err(new ExpenseNotFoundError('Expense not found'));
    if (input.expenseCategoryId !== undefined) {
      const category = await checkExpenseCategory(
        deps.catalog,
        tx,
        ctx.tenantId,
        input.expenseCategoryId,
      );
      if (!category.ok) return err(category.error);
    }
    let patch = plainPatch(input);
    const newAmount =
      input.amountCentavos === undefined ? undefined : Money.fromCentavos(input.amountCentavos);
    const changedAmount =
      newAmount !== undefined && !newAmount.equals(current.amount) ? newAmount : undefined;
    if (changedAmount) {
      const settlement = changeAmount(current, changedAmount);
      if (!settlement.ok) return err(settlement.error);
      patch = { ...patch, amount: changedAmount, status: settlement.value.status };
    }
    const updated = await deps.expenses.update(tx, ctx.tenantId, id, patch);
    if (!updated) return err(new ExpenseNotFoundError('Expense not found'));
    if (changedAmount) {
      await deps.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'expense.amount_changed',
        entity: 'expense',
        entityId: id,
        before: { amountCentavos: Number(current.amount.toCentavos()) },
        after: { amountCentavos: Number(changedAmount.toCentavos()), status: updated.status },
        at: deps.clock.now(),
      });
    }
    return ok(updated);
  });
}
