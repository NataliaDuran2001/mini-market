import type {
  ProductEmployee,
  ProductOwner,
  UpdateProductData,
} from '@mini-market/contracts/catalog';
import { err, map, NotFoundError } from '@mini-market/shared-kernel';
import type { Clock, ForbiddenError, Result, ValidationError } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import type { DuplicateCodeError } from '../domain/errors';
import { changesPrice, defaultPresentationOf } from '../domain/product';
import type { ProductPatch } from '../domain/product';
import { parseProductId } from './product-id';
import { toProductPatch } from './product-input';
import { toProductView, toWireMoney } from './product-view';
import type { ProductRepository } from './ports/product.repository';

export const UPDATE_PRODUCT = Symbol('UPDATE_PRODUCT');

export interface UpdateProductDeps {
  readonly products: ProductRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

export type UpdateProductError =
  ForbiddenError | NotFoundError | ValidationError | DuplicateCodeError;

export type UpdateProduct = (
  ctx: TenantContext,
  id: string,
  input: UpdateProductData,
) => Promise<Result<ProductOwner | ProductEmployee, UpdateProductError>>;

/** Owner only. A price change is written to the audit log with both values, in the same transaction. */
export function updateProduct(
  deps: UpdateProductDeps,
  ctx: TenantContext,
  id: string,
  input: UpdateProductData,
): Promise<Result<ProductOwner | ProductEmployee, UpdateProductError>> {
  return applyProductPatch(deps, ctx, id, toProductPatch(input));
}

/** Shared by `updateProduct` and `setProductActive`: lock, check the price change, update, audit. */
export async function applyProductPatch(
  deps: UpdateProductDeps,
  ctx: TenantContext,
  id: string,
  patch: ProductPatch,
): Promise<Result<ProductOwner | ProductEmployee, UpdateProductError>> {
  const allowed = requirePermission(ctx, 'products.write');
  if (!allowed.ok) return allowed;
  const productId = parseProductId(id);
  if (!productId.ok) return productId;
  const now = deps.clock.now();
  const updated = await deps.withTransaction(ctx, async (tx) => {
    const before = await deps.products.findById(tx, ctx.tenantId, productId.value, {
      forUpdate: true,
    });
    if (!before) return err(new NotFoundError('Product not found', { id }));
    const result = await deps.products.update(tx, ctx.tenantId, productId.value, patch, now);
    if (result.ok && patch.salePrice && changesPrice(before, patch)) {
      await deps.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'product.price_changed',
        entity: 'presentation',
        entityId: defaultPresentationOf(before).id,
        before: { productId: before.id, salePrice: toWireMoney(before.salePrice) },
        after: { productId: before.id, salePrice: toWireMoney(patch.salePrice) },
        at: now,
      });
    }
    return result;
  });
  return map(updated, (product) => toProductView(ctx, product));
}
