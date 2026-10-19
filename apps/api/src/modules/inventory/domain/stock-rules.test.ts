import { Money, Quantity } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import { validateMovement } from './movement';
import type { MovementKind, NewMovement } from './movement';
import {
  crossesIntoLowStock,
  isLowStock,
  levelAfter,
  violatesNegativeStockRule,
} from './stock-rules';

const q = (value: string) => Quantity.parse(value);
const movement = (kind: MovementKind, quantity: string, extra: Partial<NewMovement> = {}) => ({
  productId: 'p1',
  kind,
  quantity: q(quantity),
  unitCost: null,
  ...extra,
});

describe('S13 negative stock', () => {
  it('rejects a change that leaves the product below zero unless the tenant allows it', () => {
    expect(violatesNegativeStockRule(q('5'), q('-1'), false)).toBe(true);
    expect(violatesNegativeStockRule(q('5'), q('-1'), true)).toBe(false);
    expect(violatesNegativeStockRule(q('5'), q('0'), false)).toBe(false);
  });

  it('lets a product that is already below zero receive stock or stay as it is', () => {
    expect(violatesNegativeStockRule(q('-3'), q('-1'), false)).toBe(false);
    expect(violatesNegativeStockRule(q('-3'), q('-3'), false)).toBe(false);
    expect(violatesNegativeStockRule(q('-3'), q('-4'), false)).toBe(true);
  });

  it('adds the movements of a product in order', () => {
    const after = levelAfter(q('5'), [movement('sale', '-2'), movement('purchase', '10')]);
    expect(after.toString()).toBe('13.000');
  });
});

describe('low stock threshold', () => {
  it('is low at or under a minimum above zero, and always below zero', () => {
    expect(isLowStock(q('10'), q('10'))).toBe(true);
    expect(isLowStock(q('10.001'), q('10'))).toBe(false);
    expect(isLowStock(q('0'), q('0'))).toBe(false); // no threshold set
    expect(isLowStock(q('-0.001'), q('0'))).toBe(true);
  });

  it('fires only when a change moves the product from fine into low', () => {
    expect(crossesIntoLowStock(q('11'), q('9'), q('10'))).toBe(true);
    expect(crossesIntoLowStock(q('9'), q('8'), q('10'))).toBe(false);
    expect(crossesIntoLowStock(q('11'), q('10.5'), q('10'))).toBe(false);
    expect(crossesIntoLowStock(q('9'), q('20'), q('10'))).toBe(false);
  });
});

describe('movement validation', () => {
  it('refuses a zero movement and a movement that goes the wrong way for its kind', () => {
    expect(validateMovement(movement('purchase', '0')).ok).toBe(false);
    expect(validateMovement(movement('sale', '2')).ok).toBe(false);
    expect(validateMovement(movement('expired', '1')).ok).toBe(false);
    expect(validateMovement(movement('purchase', '-1')).ok).toBe(false);
    expect(validateMovement(movement('initial', '-1')).ok).toBe(false);
    expect(validateMovement(movement('void', '-1')).ok).toBe(false);
  });

  it('accepts each kind in its direction, and an adjustment either way with a reason', () => {
    expect(validateMovement(movement('sale', '-2')).ok).toBe(true);
    expect(validateMovement(movement('void', '2')).ok).toBe(true);
    expect(validateMovement(movement('adjustment', '-2', { reason: 'merma' })).ok).toBe(true);
    expect(validateMovement(movement('adjustment', '2', { reason: 'conteo' })).ok).toBe(true);
  });

  it('demands a reason for an adjustment and a non-negative cost', () => {
    expect(validateMovement(movement('adjustment', '-2')).ok).toBe(false);
    expect(validateMovement(movement('adjustment', '-2', { reason: '  ' })).ok).toBe(false);
    expect(
      validateMovement(movement('purchase', '2', { unitCost: Money.fromCentavos(-1) })).ok,
    ).toBe(false);
  });
});
