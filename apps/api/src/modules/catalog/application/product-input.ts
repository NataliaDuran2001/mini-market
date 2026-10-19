import type { CreateProductData, UpdateProductData } from '@mini-market/contracts/catalog';
import { Money, Quantity } from '@mini-market/shared-kernel';
import type { NewProduct, ProductPatch } from '../domain/product';

/** The contract guarantees a positive whole number of centavos and a valid quantity string. */
export function toNewProduct(data: CreateProductData): NewProduct {
  return {
    name: data.name,
    code: data.code,
    categoryId: data.categoryId,
    baseUnitId: data.baseUnitId,
    salePrice: Money.fromCentavos(data.salePrice),
    minStock: Quantity.parse(data.minStock),
  };
}

export function toProductPatch(data: UpdateProductData): ProductPatch {
  return {
    name: data.name,
    code: data.code,
    categoryId: data.categoryId,
    salePrice: data.salePrice === undefined ? undefined : Money.fromCentavos(data.salePrice),
    minStock: data.minStock === undefined ? undefined : Quantity.parse(data.minStock),
  };
}
