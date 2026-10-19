import { Money, Quantity } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import { changesPrice, defaultPresentationOf, marginOf } from './product';
import type { Product } from './product';

const aProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Coca Cola 2L',
  code: null,
  categoryId: null,
  baseUnitId: 'u1',
  salePrice: Money.fromCentavos(1250),
  avgCost: Money.fromCentavos(800),
  minStock: Quantity.zero(),
  isActive: true,
  presentations: [
    {
      id: 'pr1',
      name: 'Unidad',
      factor: 1,
      salePrice: Money.fromCentavos(1250),
      isDefault: true,
    },
  ],
  createdAt: new Date('2026-10-15T14:00:00Z'),
  updatedAt: new Date('2026-10-15T14:00:00Z'),
  ...overrides,
});

describe('product rules', () => {
  it('computes the margin as price minus average cost, which can be negative', () => {
    expect(marginOf(aProduct()).toCentavos()).toBe(450n);
    expect(marginOf(aProduct({ avgCost: Money.fromCentavos(2000) })).toCentavos()).toBe(-750n);
  });

  it('finds the default presentation, and fails loudly when a product has none', () => {
    expect(defaultPresentationOf(aProduct()).factor).toBe(1);
    expect(() => defaultPresentationOf(aProduct({ presentations: [] }))).toThrow();
  });

  it('sees a price change only when the new price differs', () => {
    const product = aProduct();
    expect(changesPrice(product, { salePrice: Money.fromCentavos(1300) })).toBe(true);
    expect(changesPrice(product, { salePrice: Money.fromCentavos(1250) })).toBe(false);
    expect(changesPrice(product, { name: 'Otra' })).toBe(false);
  });
});
