import { describe, expect, it } from 'vitest';
import {
  createProductInputSchema,
  searchProductsQuerySchema,
  updateProductInputSchema,
} from '../src/catalog/index.js';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const valid = { name: 'Coca Cola 2L', salePrice: 1250, categoryId: ID, baseUnitId: ID };

describe('product contracts', () => {
  it('accepts whole centavos above zero and rejects zero, negatives, decimals and strings', () => {
    expect(createProductInputSchema.safeParse(valid).success).toBe(true);
    for (const salePrice of [0, -1, 12.5, '12.50', Number.MAX_SAFE_INTEGER + 2]) {
      expect(createProductInputSchema.safeParse({ ...valid, salePrice }).success).toBe(false);
    }
  });

  it('defaults the optional fields and turns a blank code into no code', () => {
    expect(createProductInputSchema.parse({ ...valid, code: '  ' })).toEqual({
      ...valid,
      code: null,
      minStock: '0.000',
    });
    expect(createProductInputSchema.parse({ ...valid, code: ' 779 ' }).code).toBe('779');
    expect(
      createProductInputSchema.parse({ name: 'X', salePrice: 1, baseUnitId: ID }),
    ).toMatchObject({
      categoryId: null,
    });
  });

  it('rejects a negative or malformed minimum stock and unknown fields', () => {
    expect(createProductInputSchema.safeParse({ ...valid, minStock: '-1.000' }).success).toBe(
      false,
    );
    expect(createProductInputSchema.safeParse({ ...valid, minStock: '1.0005' }).success).toBe(
      false,
    );
    expect(createProductInputSchema.safeParse({ ...valid, avgCost: 1 }).success).toBe(false);
  });

  it('refuses an empty patch and a patch that changes the base unit', () => {
    expect(updateProductInputSchema.safeParse({}).success).toBe(false);
    expect(updateProductInputSchema.safeParse({ baseUnitId: ID }).success).toBe(false);
    expect(updateProductInputSchema.safeParse({ code: null, categoryId: null }).success).toBe(true);
  });

  it('reads the search query from strings', () => {
    expect(searchProductsQuerySchema.parse({ q: ' coca ', activeOnly: 'true', page: '2' })).toEqual(
      {
        q: 'coca',
        activeOnly: true,
        page: 2,
        pageSize: 20,
      },
    );
  });
});
