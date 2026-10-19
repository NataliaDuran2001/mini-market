import type { Money, NotFoundError, Result, ValidationError } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type { DuplicateCodeError } from '../../domain/errors';
import type {
  NewProduct,
  Product,
  ProductPatch,
  ProductSearch,
  ProductSummary,
} from '../../domain/product';

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
   * The few fields other modules need about many products at once (inventory checks the minimum
   * stock of the products it moves). Without `ids`, every product of the tenant, by name.
   */
  summaries(
    tx: Transaction,
    tenantId: string,
    options?: { readonly ids?: readonly string[]; readonly activeOnly?: boolean },
  ): Promise<readonly ProductSummary[]>;

  /**
   * Sets the weighted average cost (S3). Only inventory calls it, when a movement changes the
   * cost basis (initial stock, purchases). Answers false when the tenant has no such product.
   */
  setAverageCost(
    tx: Transaction,
    tenantId: string,
    id: string,
    averageCost: Money,
    now: Date,
  ): Promise<boolean>;

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
