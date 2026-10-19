import type { AdjustStockInput, StockChange } from '@mini-market/contracts/inventory';
import { err, ok, Quantity } from '@mini-market/shared-kernel';
import type {
  ForbiddenError,
  NotFoundError,
  Result,
  ValidationError,
} from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import type { InsufficientStockError } from '../domain/errors';
import { recordMovements } from './record-movements';
import type { RecordMovementsDeps } from './record-movements';

export const ADJUST_STOCK = Symbol('ADJUST_STOCK');

export interface AdjustStockDeps extends RecordMovementsDeps {
  readonly audit: AuditPort;
  readonly withTransaction: WithTransaction;
}

export type AdjustStockError =
  ForbiddenError | ValidationError | NotFoundError | InsufficientStockError;

export type AdjustStock = (
  ctx: TenantContext,
  input: AdjustStockInput,
) => Promise<Result<StockChange, AdjustStockError>>;

/**
 * Owner only. A manual correction with a mandatory reason: one `adjustment` movement, the level
 * moved by it, and `inventory.adjusted` in the audit log, all in one transaction. S13 applies like
 * for any other movement.
 */
export function adjustStock(
  deps: AdjustStockDeps,
  ctx: TenantContext,
  input: AdjustStockInput,
): Promise<Result<StockChange, AdjustStockError>> {
  const allowed = requirePermission(ctx, 'inventory.adjust');
  if (!allowed.ok) return Promise.resolve(allowed);
  const delta = Quantity.parse(input.delta);
  return deps.withTransaction(ctx, async (tx) => {
    const recorded = await recordMovements(deps, ctx, tx, [
      {
        productId: input.productId,
        kind: 'adjustment',
        quantity: delta,
        unitCost: null,
        referenceType: 'adjustment',
        reason: input.reason,
      },
    ]);
    const change = recorded.ok ? recorded.value[0] : undefined;
    if (!recorded.ok) return err(recorded.error);
    if (!change) throw new Error('recordMovements answered no change for one movement');
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'inventory.adjusted',
      entity: 'product',
      entityId: input.productId,
      before: { quantity: change.before.toString() },
      after: {
        quantity: change.after.toString(),
        delta: delta.toString(),
        reason: input.reason,
      },
      at: deps.clock.now(),
    });
    return ok({
      productId: input.productId,
      before: change.before.toString(),
      after: change.after.toString(),
    });
  });
}
