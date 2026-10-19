// Stock rules S13 and the low-stock threshold. Pure TypeScript.
import type { Quantity } from '@mini-market/shared-kernel';
import type { NewMovement } from './movement';

/** The quantity after applying the movements, in order. */
export function levelAfter(current: Quantity, movements: readonly NewMovement[]): Quantity {
  return movements.reduce((level, movement) => level.add(movement.quantity), current);
}

/**
 * S13: a change that would leave the product below zero is rejected unless the tenant allows
 * negative stock. A product that is already below zero may still receive stock or stay as it is.
 */
export function violatesNegativeStockRule(
  before: Quantity,
  after: Quantity,
  allowNegativeStock: boolean,
): boolean {
  return !allowNegativeStock && after.isNegative() && after.compare(before) < 0;
}

/**
 * Whether a product shows in the low-stock view: below zero always (S13), otherwise at or under
 * its minimum stock when one is set. A minimum of zero means "no threshold".
 */
export function isLowStock(quantity: Quantity, minStock: Quantity): boolean {
  if (quantity.isNegative()) return true;
  return minStock.isPositive() && quantity.compare(minStock) <= 0;
}

/** True when a change moves the product from fine into the low-stock view: the alert fires once. */
export function crossesIntoLowStock(
  before: Quantity,
  after: Quantity,
  minStock: Quantity,
): boolean {
  return !isLowStock(before, minStock) && isLowStock(after, minStock);
}
