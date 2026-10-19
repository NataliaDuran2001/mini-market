import type { SetInitialStockInput, StockChange } from '@mini-market/contracts/inventory';
import { err, Money, NotFoundError, ok, Quantity } from '@mini-market/shared-kernel';
import type { Clock, ForbiddenError, Result, ValidationError } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { ProductRepository } from '../../catalog';
import type { InsufficientStockError } from '../domain/errors';
import { StockAlreadyStartedError } from '../domain/errors';
import { recordMovements } from './record-movements';
import type { RecordMovementsDeps } from './record-movements';
import type { StockRepository } from './ports/stock.repository';

export const SET_INITIAL_STOCK = Symbol('SET_INITIAL_STOCK');
export const APPLY_INITIAL_STOCK = Symbol('APPLY_INITIAL_STOCK');

export interface SetInitialStockDeps extends RecordMovementsDeps {
  readonly stock: StockRepository;
  readonly products: ProductRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

export type SetInitialStockError =
  | ForbiddenError
  | ValidationError
  | NotFoundError
  | StockAlreadyStartedError
  | InsufficientStockError;

export type SetInitialStock = (
  ctx: TenantContext,
  input: SetInitialStockInput,
) => Promise<Result<StockChange, SetInitialStockError>>;

/**
 * Owner only. The opening stock of a product, allowed only while the product has no movement
 * (otherwise the ledger already tells its story). It sets the average cost to the given cost
 * (S3: "initial stock sets the average to the imported cost").
 */
export function setInitialStock(
  deps: SetInitialStockDeps,
  ctx: TenantContext,
  input: SetInitialStockInput,
): Promise<Result<StockChange, SetInitialStockError>> {
  const allowed = requirePermission(ctx, 'inventory.adjust');
  if (!allowed.ok) return Promise.resolve(allowed);
  return deps.withTransaction(ctx, (tx) => applyInitialStock(deps, ctx, tx, input));
}

/**
 * The same inside the caller's transaction, for flows that open stock for many products at once
 * (the CSV import). The caller checks the permission.
 */
export async function applyInitialStock(
  deps: SetInitialStockDeps,
  ctx: TenantContext,
  tx: Transaction,
  input: SetInitialStockInput,
): Promise<Result<StockChange, SetInitialStockError>> {
  const known = await deps.products.summaries(tx, ctx.tenantId, { ids: [input.productId] });
  if (known.length === 0) {
    return err(new NotFoundError('Product not found', { productId: input.productId }));
  }
  // Holding the level row makes two openings of the same product queue instead of both passing.
  await deps.stock.lockLevel(tx, ctx.tenantId, input.productId);
  if (await deps.stock.hasMovements(tx, ctx.tenantId, input.productId)) {
    return err(new StockAlreadyStartedError('The product already has stock movements', input));
  }
  const unitCost = Money.fromCentavos(input.unitCost);
  const recorded = await recordMovements(deps, ctx, tx, [
    {
      productId: input.productId,
      kind: 'initial',
      quantity: Quantity.parse(input.quantity),
      unitCost,
      referenceType: 'product',
      referenceId: input.productId,
    },
  ]);
  if (!recorded.ok) return recorded;
  const updated = await deps.products.setAverageCost(
    tx,
    ctx.tenantId,
    input.productId,
    unitCost,
    deps.clock.now(),
  );
  const change = recorded.value[0];
  if (!updated || !change) {
    return err(new NotFoundError('Product not found', { productId: input.productId }));
  }
  return ok({
    productId: input.productId,
    before: change.before.toString(),
    after: change.after.toString(),
  });
}
