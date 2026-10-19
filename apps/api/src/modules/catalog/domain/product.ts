// Product and presentation (S11, docs/01-domain.md section 3). Pure TypeScript.
import type { Money, Quantity } from '@mini-market/shared-kernel';

/** A sellable unit of a product: `factor` base units at `salePrice` (S11). */
export interface Presentation {
  readonly id: string;
  readonly name: string;
  readonly factor: number;
  readonly salePrice: Money;
  readonly isDefault: boolean;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  /** Barcode or SKU, unique per tenant when present. */
  readonly code: string | null;
  readonly categoryId: string | null;
  /** Stock is counted in this unit. */
  readonly baseUnitId: string;
  readonly salePrice: Money;
  /** S3: weighted average cost. Owner only; inventory maintains it. */
  readonly avgCost: Money;
  readonly minStock: Quantity;
  readonly isActive: boolean;
  readonly presentations: readonly Presentation[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewProduct {
  readonly name: string;
  readonly code: string | null;
  readonly categoryId: string | null;
  readonly baseUnitId: string;
  readonly salePrice: Money;
  readonly minStock: Quantity;
}

/** Fields an update may change; a key left out keeps its stored value. */
export interface ProductPatch {
  readonly name?: string | undefined;
  readonly code?: string | null | undefined;
  readonly categoryId?: string | null | undefined;
  readonly salePrice?: Money | undefined;
  readonly minStock?: Quantity | undefined;
  readonly isActive?: boolean | undefined;
}

/** What other modules may know about a product without its price or cost. */
export interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly minStock: Quantity;
  readonly isActive: boolean;
}

/** What a product search asks for. `page` starts at 1. */
export interface ProductSearch {
  readonly q: string | undefined;
  readonly categoryId: string | undefined;
  readonly activeOnly: boolean;
  readonly page: number;
  readonly pageSize: number;
}

/** Selling price minus average cost per base unit. Owner only. */
export function marginOf(product: Pick<Product, 'salePrice' | 'avgCost'>): Money {
  return product.salePrice.subtract(product.avgCost);
}

/** v1 products have exactly one presentation, the default one with factor 1. */
export function defaultPresentationOf(product: Pick<Product, 'presentations'>): Presentation {
  const found = product.presentations.find((presentation) => presentation.isDefault);
  if (!found) throw new Error('A product always has a default presentation');
  return found;
}

/** True when the patch sets a price different from the current one. */
export function changesPrice(product: Pick<Product, 'salePrice'>, patch: ProductPatch): boolean {
  return patch.salePrice !== undefined && !patch.salePrice.equals(product.salePrice);
}
