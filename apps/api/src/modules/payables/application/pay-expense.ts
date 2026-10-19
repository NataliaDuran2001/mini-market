import type { PayExpenseRequest } from '@mini-market/contracts/payables';
import { Money, Period, err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import { registerPayment } from '../domain/expense';
import type { Expense } from '../domain/expense';
import { ExpenseNotFoundError } from '../domain/errors';
import { checkPaymentMethod } from './catalog-checks';
import type { CatalogLookup } from './ports/catalog-lookup.port';
import type { ExpenseRepository } from './ports/expense.repository';

export const PAY_EXPENSE = Symbol('PAY_EXPENSE');

export type PayExpense = (
  ctx: TenantContext,
  id: string,
  input: PayExpenseRequest,
) => Promise<Result<Expense, DomainError>>;

export interface PayExpenseDeps {
  readonly expenses: ExpenseRepository;
  readonly catalog: CatalogLookup;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * Owner only. A partial payment leaves the expense `partial`, the payment that reaches the amount
 * makes it `paid`, and one above the balance is refused (S9). The payment is audited. Paying never
 * moves the expense to another period (S5).
 */
export async function payExpense(
  deps: PayExpenseDeps,
  ctx: TenantContext,
  id: string,
  input: PayExpenseRequest,
): Promise<Result<Expense, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;

  const now = deps.clock.now();
  const paidAt = input.paidOn ?? Period.dayKey(now, ctx.settings.timezone);
  const amount = Money.fromCentavos(input.amountCentavos);

  return deps.withTransaction(ctx, async (tx): Promise<Result<Expense, DomainError>> => {
    const current = await deps.expenses.findForUpdate(tx, ctx.tenantId, id);
    if (!current) return err(new ExpenseNotFoundError('Expense not found'));
    const method = await checkPaymentMethod(deps.catalog, tx, ctx.tenantId, input.paymentMethodId);
    if (!method.ok) return err(method.error);
    const settlement = registerPayment(current, amount);
    if (!settlement.ok) return err(settlement.error);

    await deps.expenses.insertPayment(tx, ctx.tenantId, {
      expenseId: id,
      amount,
      paidAt,
      paymentMethodId: input.paymentMethodId,
      createdBy: ctx.userId,
    });
    const updated = await deps.expenses.update(tx, ctx.tenantId, id, settlement.value);
    if (!updated) return err(new ExpenseNotFoundError('Expense not found'));
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'expense.paid',
      entity: 'expense',
      entityId: id,
      before: { paidCentavos: Number(current.paid.toCentavos()), status: current.status },
      after: {
        paymentCentavos: input.amountCentavos,
        paidCentavos: Number(updated.paid.toCentavos()),
        status: updated.status,
        paidAt,
      },
      at: now,
    });
    return ok(updated);
  });
}
