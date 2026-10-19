import type { ProductEmployee, ProductOwner } from '@mini-market/contracts/catalog';
import { err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { ForbiddenError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { parseProductId } from './product-id';
import { toProductView } from './product-view';
import type { ProductRepository } from './ports/product.repository';

export const GET_PRODUCT = Symbol('GET_PRODUCT');

export interface GetProductDeps {
  readonly products: ProductRepository;
  readonly withTransaction: WithTransaction;
}

type GetProductError = ForbiddenError | NotFoundError;

export type GetProduct = (
  ctx: TenantContext,
  id: string,
) => Promise<Result<ProductOwner | ProductEmployee, GetProductError>>;

/** Every member reads products; cost and margin only reach callers with `costs.read`. */
export async function getProduct(
  deps: GetProductDeps,
  ctx: TenantContext,
  id: string,
): Promise<Result<ProductOwner | ProductEmployee, GetProductError>> {
  const allowed = requirePermission(ctx, 'products.read');
  if (!allowed.ok) return allowed;
  const productId = parseProductId(id);
  if (!productId.ok) return productId;
  const product = await deps.withTransaction(ctx, (tx) =>
    deps.products.findById(tx, ctx.tenantId, productId.value),
  );
  return product
    ? ok(toProductView(ctx, product))
    : err(new NotFoundError('Product not found', { id }));
}
