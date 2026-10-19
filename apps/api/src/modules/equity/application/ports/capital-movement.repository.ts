import type { Money } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type {
  CapitalMovement,
  CapitalMovementKind,
  CapitalTotals,
} from '../../domain/capital-movement';

export interface NewCapitalMovement {
  readonly kind: CapitalMovementKind;
  readonly amount: Money;
  readonly occurredAt: Date;
  readonly note: string | null;
  readonly createdBy: string;
}

export interface CapitalMovementPage {
  readonly items: readonly CapitalMovement[];
  readonly total: number;
}

/**
 * The capital ledger. Append-only: there is no update and no delete, a correction is a new
 * movement (hard rule 3).
 */
export interface CapitalMovementRepository {
  /**
   * Serializes recorders of one tenant until the transaction ends, so the over-withdrawal flag is
   * computed on the totals the previous recorder committed.
   */
  lockLedger(tx: Transaction, tenantId: string): Promise<void>;
  insert(tx: Transaction, tenantId: string, movement: NewCapitalMovement): Promise<CapitalMovement>;
  /** Newest first. */
  list(
    tx: Transaction,
    tenantId: string,
    page: { readonly limit: number; readonly offset: number },
  ): Promise<CapitalMovementPage>;
  /** Sums by kind over the whole ledger of the tenant. */
  totals(tx: Transaction, tenantId: string): Promise<CapitalTotals>;
}
