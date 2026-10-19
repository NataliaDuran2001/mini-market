import type { ProductEmployee, ProductOwner } from '@mini-market/contracts/catalog';
import type { Result } from '@mini-market/shared-kernel';
import type { TenantContext } from '../../access';
import { applyProductPatch } from './update-product';
import type { UpdateProductDeps, UpdateProductError } from './update-product';

export const SET_PRODUCT_ACTIVE = Symbol('SET_PRODUCT_ACTIVE');

export type SetProductActive = (
  ctx: TenantContext,
  id: string,
  isActive: boolean,
) => Promise<Result<ProductOwner | ProductEmployee, UpdateProductError>>;

/** Owner only. A retired product leaves the pickers; its history stays (ADR 0007). */
export function setProductActive(
  deps: UpdateProductDeps,
  ctx: TenantContext,
  id: string,
  isActive: boolean,
): Promise<Result<ProductOwner | ProductEmployee, UpdateProductError>> {
  return applyProductPatch(deps, ctx, id, { isActive });
}
