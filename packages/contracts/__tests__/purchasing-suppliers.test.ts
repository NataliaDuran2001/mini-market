import { describe, expect, it } from 'vitest';
import {
  createSupplierRequestSchema,
  listSuppliersQuerySchema,
  supplierSchema,
  updateSupplierRequestSchema,
} from '../src/purchasing/index.js';

describe('supplier contracts', () => {
  it('trims the name, turns blank optional fields into null and lower-cases the email', () => {
    const parsed = createSupplierRequestSchema.parse({
      name: '  Distribuidora Sur ',
      phone: ' ',
      email: ' Ventas@Sur.COM ',
      taxId: '',
    });
    expect(parsed).toEqual({
      name: 'Distribuidora Sur',
      phone: null,
      email: 'ventas@sur.com',
      taxId: null,
    });
  });

  it('rejects a blank name, a malformed email and unknown fields', () => {
    expect(createSupplierRequestSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(createSupplierRequestSchema.safeParse({ name: 'A', email: 'nope' }).success).toBe(false);
    expect(createSupplierRequestSchema.safeParse({ name: 'A', tenantId: 'x' }).success).toBe(false);
  });

  it('accepts details or active in an update, never both and never neither', () => {
    expect(updateSupplierRequestSchema.safeParse({ name: 'Nuevo' }).success).toBe(true);
    expect(updateSupplierRequestSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateSupplierRequestSchema.safeParse({ name: 'Nuevo', active: false }).success).toBe(
      false,
    );
    expect(updateSupplierRequestSchema.safeParse({}).success).toBe(false);
  });

  it('reads the list filters from a query string', () => {
    expect(listSuppliersQuerySchema.parse({ q: ' sur ', active: 'true' })).toEqual({
      q: 'sur',
      active: true,
    });
    expect(listSuppliersQuerySchema.parse({})).toEqual({});
    expect(listSuppliersQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
  });

  it('describes a supplier without the tenant', () => {
    const supplier = {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      name: 'Sur',
      phone: null,
      email: null,
      taxId: null,
      notes: null,
      active: true,
    };
    expect(supplierSchema.safeParse(supplier).success).toBe(true);
    expect(supplierSchema.safeParse({ ...supplier, active: 'si' }).success).toBe(false);
  });
});
