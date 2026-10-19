import type { Quantity } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type { NewMovement, StockLevel, StockMovement } from '../../domain/movement';

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Storage of the stock ledger and the levels derived from it (ADR 0005). Every method takes the
 * tenant explicitly and the caller's transaction, bound to that tenant by row level security.
 * Nothing updates or deletes a movement.
 */
export interface StockRepository {
  /**
   * Creates the level row of the product at zero when it is missing, locks it until the
   * transaction ends and returns its quantity. Concurrent changes of one product queue here.
   */
  lockLevel(tx: Transaction, tenantId: string, productId: string): Promise<Quantity>;

  saveLevel(
    tx: Transaction,
    tenantId: string,
    productId: string,
    quantity: Quantity,
    now: Date,
  ): Promise<void>;

  insertMovements(
    tx: Transaction,
    tenantId: string,
    userId: string,
    movements: readonly NewMovement[],
    now: Date,
  ): Promise<void>;

  hasMovements(tx: Transaction, tenantId: string, productId: string): Promise<boolean>;

  listLevels(
    tx: Transaction,
    tenantId: string,
    filter: {
      readonly productIds?: readonly string[];
      readonly page: number;
      readonly pageSize: number;
    },
  ): Promise<Page<StockLevel>>;

  /** Every level of the tenant: the low-stock view merges them with the product thresholds. */
  allLevels(tx: Transaction, tenantId: string): Promise<readonly StockLevel[]>;

  /** Newest first. */
  listMovements(
    tx: Transaction,
    tenantId: string,
    productId: string,
    paging: { readonly page: number; readonly pageSize: number },
  ): Promise<Page<StockMovement>>;
}

/** Where the use cases report what an operator should notice (S13 allows negative stock loudly). */
export interface StockLogger {
  warn(data: Record<string, unknown>, message: string): void;
}
