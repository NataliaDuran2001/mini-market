import type { NotFoundError, Result, ValidationError } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type { DuplicateCodeError } from '../../domain/errors';
import type { NewProduct, Product, ProductPatch, ProductSearch } from '../../domain/product';

export interface ProductPage {
  readonly items: readonly Product[];
  readonly total: number;
}

/**
 * Product storage. Every method takes the tenant explicitly and the caller's transaction, bound to
 * that tenant by row level security (ADR 0001). Nothing deletes a product.
 */
export interface ProductRepository {
  /** `forUpdate` locks the row so a concurrent change waits for the caller's transaction. */
  findById(
    tx: Transaction,
    tenantId: string,
    id: string,
    options?: { readonly forUpdate?: boolean },
  ): Promise<Product | null>;

  search(tx: Transaction, tenantId: string, search: ProductSearch): Promise<ProductPage>;

  /**
   * Creates the product and its default presentation (factor 1, same price). A category or unit
   * that is not of this tenant is a ValidationError naming the field.
   */
  create(
    tx: Transaction,
    tenantId: string,
    product: NewProduct,
    now: Date,
  ): Promise<Result<Product, DuplicateCodeError | ValidationError>>;

  /** A new price is also written to the default presentation. */
  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ProductPatch,
    now: Date,
  ): Promise<Result<Product, NotFoundError | DuplicateCodeError | ValidationError>>;
}
