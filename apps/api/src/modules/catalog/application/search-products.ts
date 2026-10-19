import type { SearchProductsQuery, SearchProductsResponse } from '@mini-market/contracts/catalog';
import { ok } from '@mini-market/shared-kernel';
import type { ForbiddenError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { toProductView } from './product-view';
import type { ProductRepository } from './ports/product.repository';

export const SEARCH_PRODUCTS = Symbol('SEARCH_PRODUCTS');

export interface SearchProductsDeps {
  readonly products: ProductRepository;
  readonly withTransaction: WithTransaction;
}

export type SearchProducts = (
  ctx: TenantContext,
  query: SearchProductsQuery,
) => Promise<Result<SearchProductsResponse, ForbiddenError>>;

/**
 * Finds products by name (contains, case-insensitive) or exact code, best match first: names that
 * start with the text, names that contain it, then products found only by code. Every member may
 * search.
 */
export async function searchProducts(
  deps: SearchProductsDeps,
  ctx: TenantContext,
  query: SearchProductsQuery,
): Promise<Result<SearchProductsResponse, ForbiddenError>> {
  const allowed = requirePermission(ctx, 'products.read');
  if (!allowed.ok) return allowed;
  const { page, pageSize } = query;
  const found = await deps.withTransaction(ctx, (tx) =>
    deps.products.search(tx, ctx.tenantId, {
      q: query.q === '' ? undefined : query.q,
      categoryId: query.categoryId,
      activeOnly: query.activeOnly,
      page,
      pageSize,
    }),
  );
  return ok({
    items: found.items.map((product) => toProductView(ctx, product)),
    page,
    pageSize,
    total: found.total,
  });
}
