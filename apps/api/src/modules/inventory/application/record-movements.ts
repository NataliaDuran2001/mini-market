import { err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { Clock, Quantity, Result, ValidationError } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import type { ProductRepository } from '../../catalog';
import type { TenantContext } from '../../access';
import { InsufficientStockError } from '../domain/errors';
import type { StockBelowMinimum } from '../domain/events';
import { validateMovement } from '../domain/movement';
import type { NewMovement } from '../domain/movement';
import { crossesIntoLowStock, levelAfter, violatesNegativeStockRule } from '../domain/stock-rules';
import type { StockLogger, StockRepository } from './ports/stock.repository';

export const RECORD_MOVEMENTS = Symbol('RECORD_MOVEMENTS');

export interface RecordMovementsDeps {
  readonly stock: StockRepository;
  readonly products: ProductRepository;
  readonly logger: StockLogger;
  readonly clock: Clock;
}

/** What one product went through: the caller needs `before` to recompute the average cost (S3). */
export interface LevelChange {
  readonly productId: string;
  readonly before: Quantity;
  readonly after: Quantity;
}

export type RecordMovementsError = ValidationError | NotFoundError | InsufficientStockError;

export type RecordMovements = (
  ctx: TenantContext,
  tx: Transaction,
  movements: readonly NewMovement[],
) => Promise<Result<readonly LevelChange[], RecordMovementsError>>;

function groupByProduct(movements: readonly NewMovement[]): Map<string, NewMovement[]> {
  const groups = new Map<string, NewMovement[]>();
  for (const movement of movements) {
    groups.set(movement.productId, [...(groups.get(movement.productId) ?? []), movement]);
  }
  // Locking in a fixed order keeps two sales with the same products from deadlocking.
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * The only writer of the ledger (ADR 0005), called by the use cases of other modules inside their
 * transaction (ADR 0014); the caller checks its own permission. Per product it locks the level
 * row, applies S13 (`allowNegativeStock` of the tenant settings) and, when everything holds,
 * appends the movements, saves the levels and queues `StockBelowMinimum` for after the commit.
 * A rejection writes no movement and changes no level.
 */
export async function recordMovements(
  deps: RecordMovementsDeps,
  ctx: TenantContext,
  tx: Transaction,
  movements: readonly NewMovement[],
): Promise<Result<readonly LevelChange[], RecordMovementsError>> {
  for (const movement of movements) {
    const valid = validateMovement(movement);
    if (!valid.ok) return valid;
  }
  const groups = groupByProduct(movements);
  const summaries = await deps.products.summaries(tx, ctx.tenantId, { ids: [...groups.keys()] });
  const minStockOf = new Map(summaries.map((product) => [product.id, product.minStock]));

  const changes: LevelChange[] = [];
  for (const [productId, group] of groups) {
    if (!minStockOf.has(productId)) {
      return err(new NotFoundError('Product not found', { productId }));
    }
    const before = await deps.stock.lockLevel(tx, ctx.tenantId, productId);
    const after = levelAfter(before, group);
    if (violatesNegativeStockRule(before, after, ctx.settings.allowNegativeStock)) {
      return err(
        new InsufficientStockError('Not enough stock', {
          productId,
          available: before.toString(),
          requested: after.subtract(before).toString(),
        }),
      );
    }
    changes.push({ productId, before, after });
  }

  const now = deps.clock.now();
  await deps.stock.insertMovements(tx, ctx.tenantId, ctx.userId, movements, now);
  for (const { productId, before, after } of changes) {
    await deps.stock.saveLevel(tx, ctx.tenantId, productId, after, now);
    if (after.isNegative()) {
      // S13 with allowNegativeStock: recorded, and visible in the low-stock view until restored.
      deps.logger.warn(
        { tenantId: ctx.tenantId, productId, quantity: after.toString() },
        'stock level went below zero',
      );
    }
    const minStock = minStockOf.get(productId);
    if (minStock && crossesIntoLowStock(before, after, minStock)) {
      const event: StockBelowMinimum = {
        type: 'StockBelowMinimum',
        tenantId: ctx.tenantId,
        productId,
        quantity: after.toString(),
        minStock: minStock.toString(),
        occurredAt: now,
      };
      ctx.publishAfterCommit(event);
    }
  }
  return ok(changes);
}
