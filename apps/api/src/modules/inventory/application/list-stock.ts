import type {
  ListMovementsQuery,
  ListMovementsResponse,
  ListStockLevelsQuery,
  ListStockLevelsResponse,
  LowStockQuery,
  LowStockResponse,
} from '@mini-market/contracts/inventory';
import { err, NotFoundError, ok, Quantity } from '@mini-market/shared-kernel';
import type { Clock, ForbiddenError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { ProductRepository } from '../../catalog';
import { isLowStock } from '../domain/stock-rules';
import type { StockLevel } from '../domain/movement';
import type { StockRepository } from './ports/stock.repository';
import { toMovementView, toStockLevelView } from './views';

export const LIST_STOCK_LEVELS = Symbol('LIST_STOCK_LEVELS');
export const LIST_MOVEMENTS = Symbol('LIST_MOVEMENTS');
export const LIST_LOW_STOCK = Symbol('LIST_LOW_STOCK');
export const GET_STOCK_LEVEL = Symbol('GET_STOCK_LEVEL');

export interface StockQueryDeps {
  readonly stock: StockRepository;
  readonly products: ProductRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

export type ListStockLevels = (
  ctx: TenantContext,
  query: ListStockLevelsQuery,
) => Promise<Result<ListStockLevelsResponse, ForbiddenError>>;
export type ListMovements = (
  ctx: TenantContext,
  query: ListMovementsQuery,
) => Promise<Result<ListMovementsResponse, ForbiddenError>>;
export type ListLowStock = (
  ctx: TenantContext,
  query: LowStockQuery,
) => Promise<Result<LowStockResponse, ForbiddenError>>;
export type GetStockLevel = (
  ctx: TenantContext,
  productId: string,
) => Promise<Result<StockLevel, ForbiddenError | NotFoundError>>;

/**
 * Levels that exist. A product that never had a movement has no row: its quantity is zero. With
 * `productId` or `productIds` only those products are asked for.
 */
export async function listStockLevels(
  deps: StockQueryDeps,
  ctx: TenantContext,
  query: ListStockLevelsQuery,
): Promise<Result<ListStockLevelsResponse, ForbiddenError>> {
  const allowed = requirePermission(ctx, 'inventory.read');
  if (!allowed.ok) return allowed;
  const productIds = [...(query.productId ? [query.productId] : []), ...(query.productIds ?? [])];
  const found = await deps.withTransaction(ctx, (tx) =>
    deps.stock.listLevels(tx, ctx.tenantId, {
      ...(productIds.length > 0 ? { productIds } : {}),
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
  return ok({
    items: found.items.map(toStockLevelView),
    page: query.page,
    pageSize: query.pageSize,
    total: found.total,
  });
}

/** The level of one product, zero when it never had a movement; 404 for an unknown product. */
export async function getStockLevel(
  deps: StockQueryDeps,
  ctx: TenantContext,
  productId: string,
): Promise<Result<StockLevel, ForbiddenError | NotFoundError>> {
  const allowed = requirePermission(ctx, 'inventory.read');
  if (!allowed.ok) return allowed;
  return deps.withTransaction(ctx, async (tx) => {
    const known = await deps.products.summaries(tx, ctx.tenantId, { ids: [productId] });
    if (known.length === 0) return err(new NotFoundError('Product not found', { productId }));
    const found = await deps.stock.listLevels(tx, ctx.tenantId, {
      productIds: [productId],
      page: 1,
      pageSize: 1,
    });
    return ok(
      found.items[0] ?? { productId, quantity: Quantity.zero(), updatedAt: deps.clock.now() },
    );
  });
}

/** Newest first. Employees see the movements without their unit cost. */
export async function listMovements(
  deps: StockQueryDeps,
  ctx: TenantContext,
  query: ListMovementsQuery,
): Promise<Result<ListMovementsResponse, ForbiddenError>> {
  const allowed = requirePermission(ctx, 'inventory.read');
  if (!allowed.ok) return allowed;
  const found = await deps.withTransaction(ctx, (tx) =>
    deps.stock.listMovements(tx, ctx.tenantId, query.productId, {
      page: query.page,
      pageSize: query.pageSize,
    }),
  );
  return ok({
    items: found.items.map((movement) => toMovementView(ctx, movement)),
    page: query.page,
    pageSize: query.pageSize,
    total: found.total,
  });
}

/**
 * Active products at or under their minimum stock, and every product below zero (S13), by name.
 * Merges the levels with the product thresholds in memory: a tenant has thousands of products at
 * most, and the threshold lives in the catalog module.
 */
export async function listLowStock(
  deps: StockQueryDeps,
  ctx: TenantContext,
  query: LowStockQuery,
): Promise<Result<LowStockResponse, ForbiddenError>> {
  const allowed = requirePermission(ctx, 'inventory.read');
  if (!allowed.ok) return allowed;
  const { levels, products } = await deps.withTransaction(ctx, async (tx) => ({
    levels: await deps.stock.allLevels(tx, ctx.tenantId),
    products: await deps.products.summaries(tx, ctx.tenantId, { activeOnly: true }),
  }));
  const quantityOf = new Map(levels.map((level) => [level.productId, level.quantity]));
  const low = products.flatMap((product) => {
    const quantity = quantityOf.get(product.id) ?? Quantity.zero();
    return isLowStock(quantity, product.minStock)
      ? [
          {
            productId: product.id,
            name: product.name,
            code: product.code,
            quantity: quantity.toString(),
            minStock: product.minStock.toString(),
          },
        ]
      : [];
  });
  const start = (query.page - 1) * query.pageSize;
  return ok({
    items: low.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: low.length,
  });
}
