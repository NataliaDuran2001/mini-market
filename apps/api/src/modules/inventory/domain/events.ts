// Domain events of the inventory module (PascalCase, past tense; ADR 0014).

/**
 * A product moved from fine into the low-stock view: its level fell to its minimum stock or under
 * it, or below zero (S13). Published once, after the transaction that caused it commits.
 * Quantities are decimal strings with 3 decimals.
 */
export interface StockBelowMinimum {
  readonly type: 'StockBelowMinimum';
  readonly tenantId: string;
  readonly productId: string;
  readonly quantity: string;
  readonly minStock: string;
  readonly occurredAt: Date;
}

export type InventoryEvent = StockBelowMinimum;
