import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Period, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { ensurePeriodGenerated } from './ensure-period-generated';
import type { EnsurePeriodGeneratedDeps } from './ensure-period-generated';

export const GENERATE_EXPENSES_FOR_PERIOD = Symbol('GENERATE_EXPENSES_FOR_PERIOD');

export type GenerateExpensesForPeriod = (
  ctx: TenantContext,
  period: Period,
) => Promise<Result<{ readonly created: number }, DomainError>>;

export interface GenerateExpensesForPeriodDeps extends EnsurePeriodGeneratedDeps {
  readonly withTransaction: WithTransaction;
}

/** Owner only: generates the recurring expenses of `period` on demand. Idempotent (S5). */
export async function generateExpensesForPeriod(
  deps: GenerateExpensesForPeriodDeps,
  ctx: TenantContext,
  period: Period,
): Promise<Result<{ readonly created: number }, DomainError>> {
  const allowed = requirePermission(ctx, 'expenses.manage');
  if (!allowed.ok) return allowed;
  const created = await deps.withTransaction(ctx, (tx) =>
    ensurePeriodGenerated(deps, tx, ctx.tenantId, period),
  );
  return ok({ created });
}
