import type {
  CreateProductData,
  ProductEmployee,
  ProductOwner,
} from '@mini-market/contracts/catalog';
import type { Clock, ForbiddenError, Result, ValidationError } from '@mini-market/shared-kernel';
import { map } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { DuplicateCodeError } from '../domain/errors';
import { toNewProduct } from './product-input';
import { toProductView } from './product-view';
import type { ProductRepository } from './ports/product.repository';

export const CREATE_PRODUCT = Symbol('CREATE_PRODUCT');

export interface CreateProductDeps {
  readonly products: ProductRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

type CreateProductError = ForbiddenError | ValidationError | DuplicateCodeError;

export type CreateProduct = (
  ctx: TenantContext,
  input: CreateProductData,
) => Promise<Result<ProductOwner | ProductEmployee, CreateProductError>>;

/** Owner only. Creates the product and its default presentation (factor 1, same price, S11). */
export async function createProduct(
  deps: CreateProductDeps,
  ctx: TenantContext,
  input: CreateProductData,
): Promise<Result<ProductOwner | ProductEmployee, CreateProductError>> {
  const allowed = requirePermission(ctx, 'products.write');
  if (!allowed.ok) return allowed;
  const created = await deps.withTransaction(ctx, (tx) =>
    deps.products.create(tx, ctx.tenantId, toNewProduct(input), deps.clock.now()),
  );
  return map(created, (product) => toProductView(ctx, product));
}
