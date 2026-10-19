import { describe, expect, it } from 'vitest';
import {
  CATALOG_KINDS,
  catalogItemSchema,
  catalogItemSchemas,
  createCatalogItemInputSchemas,
  listCatalogQuerySchema,
  updateCatalogItemInputSchemas,
} from '../src/catalog/index.js';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('catalog contracts', () => {
  it('has a create and an update schema for every kind', () => {
    for (const kind of CATALOG_KINDS) {
      expect(createCatalogItemInputSchemas[kind], kind).toBeDefined();
      expect(updateCatalogItemInputSchemas[kind], kind).toBeDefined();
      expect(catalogItemSchemas[kind], kind).toBeDefined();
    }
  });

  it('trims names, defaults the optional fields and rejects blank or unknown fields', () => {
    expect(createCatalogItemInputSchemas.categories.parse({ name: '  Bebidas ' })).toEqual({
      name: 'Bebidas',
      sortOrder: 0,
    });
    expect(createCatalogItemInputSchemas.units.parse({ code: 'kg', name: 'Kilo' })).toEqual({
      code: 'kg',
      name: 'Kilo',
      allowsDecimals: false,
      sortOrder: 0,
    });
    expect(createCatalogItemInputSchemas.categories.safeParse({ name: '   ' }).success).toBe(false);
    expect(
      createCatalogItemInputSchemas.categories.safeParse({ name: 'X', tenantId: ID }).success,
    ).toBe(false);
  });

  it('accepts only the five payment method kinds and a safe code', () => {
    const schema = createCatalogItemInputSchemas['payment-methods'];
    expect(schema.safeParse({ code: 'qr', name: 'QR', kind: 'qr' }).success).toBe(true);
    expect(schema.safeParse({ code: 'qr', name: 'QR', kind: 'bitcoin' }).success).toBe(false);
    expect(schema.safeParse({ code: 'Q R;', name: 'QR', kind: 'qr' }).success).toBe(false);
  });

  it('refuses an empty patch and a patch that tries to change the code or the kind', () => {
    expect(updateCatalogItemInputSchemas.units.safeParse({}).success).toBe(false);
    expect(updateCatalogItemInputSchemas.units.safeParse({ code: 'x' }).success).toBe(false);
    expect(
      updateCatalogItemInputSchemas['payment-methods'].safeParse({ kind: 'cash' }).success,
    ).toBe(false);
    expect(updateCatalogItemInputSchemas.categories.safeParse({ isActive: false }).success).toBe(
      true,
    );
  });

  it('keeps the four item shapes apart in the union', () => {
    const category = { id: ID, name: 'A', isActive: true, sortOrder: 0 };
    expect(catalogItemSchema.parse(category)).toEqual(category);
    const unit = { ...category, code: 'kg', allowsDecimals: true };
    expect(catalogItemSchema.parse(unit)).toEqual(unit);
    expect(catalogItemSchema.safeParse({ ...category, secret: 1 }).success).toBe(false);
  });

  it('reads activeOnly from a query string', () => {
    expect(listCatalogQuerySchema.parse({})).toEqual({ activeOnly: false });
    expect(listCatalogQuerySchema.parse({ activeOnly: 'true' })).toEqual({ activeOnly: true });
    expect(listCatalogQuerySchema.safeParse({ activeOnly: 'yes' }).success).toBe(false);
  });
});
