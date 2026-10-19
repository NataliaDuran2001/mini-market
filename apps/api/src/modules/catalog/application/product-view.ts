import type { ProductEmployee, ProductOwner } from '@mini-market/contracts/catalog';
import type { Money } from '@mini-market/shared-kernel';
import type { TenantContext } from '../../access';
import { marginOf } from '../domain/product';
import type { Product } from '../domain/product';

export const COSTS_READ_PERMISSION = 'costs.read';

/** Money on the wire is an integer number of centavos (ADR 0017); amounts are safe integers. */
export function toWireMoney(money: Money): number {
  const centavos = Number(money.toCentavos());
  if (!Number.isSafeInteger(centavos)) throw new RangeError('Amount does not fit the wire format');
  return centavos;
}

/**
 * The only place that shapes a product for a caller (docs/01-domain.md section 4): the owner view
 * adds the average cost and the margin, the employee view never carries them.
 */
export function toProductView(
  ctx: Pick<TenantContext, 'can'>,
  product: Product,
): ProductOwner | ProductEmployee {
  const common: ProductEmployee = {
    id: product.id,
    name: product.name,
    code: product.code,
    categoryId: product.categoryId,
    baseUnitId: product.baseUnitId,
    salePrice: toWireMoney(product.salePrice),
    minStock: product.minStock.toString(),
    isActive: product.isActive,
    presentations: product.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      factor: presentation.factor,
      salePrice: toWireMoney(presentation.salePrice),
      isDefault: presentation.isDefault,
    })),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
  if (!ctx.can(COSTS_READ_PERMISSION)) return common;
  return {
    ...common,
    avgCost: toWireMoney(product.avgCost),
    margin: toWireMoney(marginOf(product)),
  };
}
