import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  apiErrorSchema,
  paginatedSchema,
  paginationQuerySchema,
  positiveQuantitySchema,
  quantitySchema,
  uuidSchema,
} from '../src/common/index.js';

describe('common schemas', () => {
  it('accepts uuids, including sequential test ids, and rejects other strings', () => {
    expect(uuidSchema.safeParse('3f2504e0-4f89-41d3-9a0c-0305e82c3301').success).toBe(true);
    expect(uuidSchema.safeParse('00000000-0000-0000-0000-000000000001').success).toBe(true);
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
    expect(uuidSchema.safeParse('').success).toBe(false);
    expect(uuidSchema.safeParse(42).success).toBe(false);
  });

  it('accepts quantities as decimal strings with at most 3 decimals', () => {
    for (const ok of ['0.333', '10', '2.5', '-1.000']) {
      expect(quantitySchema.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['0.3333', 'abc', '', '1e3']) {
      expect(quantitySchema.safeParse(bad).success, bad).toBe(false);
    }
    expect(quantitySchema.safeParse(0.333).success).toBe(false); // numbers are never accepted
  });

  it('bounds quantities to numeric(14,3) so a valid value never overflows the column', () => {
    expect(quantitySchema.safeParse('99999999999.999').success).toBe(true);
    expect(quantitySchema.safeParse('-99999999999.999').success).toBe(true);
    expect(quantitySchema.safeParse('100000000000.000').success).toBe(false);
    expect(quantitySchema.safeParse(`${'9'.repeat(28)}.999`).success).toBe(false);
    expect(quantitySchema.safeParse('9'.repeat(1_000_000)).success).toBe(false);
  });

  it('requires purchase and sale quantities to be greater than zero', () => {
    expect(positiveQuantitySchema.safeParse('0.001').success).toBe(true);
    for (const bad of ['0', '0.000', '-1', 'abc', '100000000000.000']) {
      expect(positiveQuantitySchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('paginates with defaults and coerces query strings', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    { page: '0' },
    { page: '1.5' },
    { pageSize: '0' },
    { pageSize: String(MAX_PAGE_SIZE + 1) },
    { page: '0x10' },
    { page: '1e1' },
    { page: ' 5 ' },
    { page: '100001' },
    { page: '1234567890' },
    { page: 'x' },
  ])('rejects the pagination query %j', (query) => {
    expect(paginationQuerySchema.safeParse(query).success).toBe(false);
  });

  it('wraps list responses in a typed envelope', () => {
    const schema = paginatedSchema(z.object({ id: uuidSchema }));
    const page = {
      items: [{ id: '00000000-0000-0000-0000-000000000001' }],
      page: 1,
      pageSize: 20,
      total: 1,
    };
    expect(schema.parse(page)).toEqual(page);
    expect(schema.safeParse({ ...page, items: [{ id: 'x' }] }).success).toBe(false);
    expect(schema.safeParse({ ...page, total: -1 }).success).toBe(false);
  });

  it('describes the error body { code, message, details }', () => {
    expect(apiErrorSchema.parse({ code: 'NOT_FOUND', message: 'missing' })).toEqual({
      code: 'NOT_FOUND',
      message: 'missing',
    });
    expect(
      apiErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'bad',
        details: { field: 'name' },
        requestId: 'req-1',
      }).success,
    ).toBe(true);
    expect(apiErrorSchema.safeParse({ code: '', message: 'x' }).success).toBe(false);
    expect(apiErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
  });
});
