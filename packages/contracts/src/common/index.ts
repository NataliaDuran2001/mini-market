// Schemas shared by every module contract. Import as `@mini-market/contracts/common`.
// No root barrel exists in this package: each module has its own subpath (ADR 0017, docs/lanes.md).
import { Quantity } from '@mini-market/shared-kernel';
import { z } from 'zod';

// '-' + 11 integer digits + '.' + 3 decimals, the widest numeric(14,3) text.
const MAX_QUANTITY_LENGTH = 16;
const MAX_PAGE = 100_000;

/** Any 8-4-4-4-12 hex id. Same shape Postgres `uuid` accepts, so sequential test ids validate. */
export const uuidSchema = z.guid();

/**
 * Quantity on the wire: a decimal string with at most 3 decimals ("0.333"), never a float.
 * Bounded to numeric(14,3), so a value that passes here never overflows the column (ADR 0004).
 */
export const quantitySchema = z
  .string()
  .max(MAX_QUANTITY_LENGTH)
  .refine(
    (value) => Quantity.tryParse(value).ok,
    'Quantity must be a decimal with at most 3 decimals',
  );

/** Quantity above zero: purchase and sale lines. Zero and negative values are rejected. */
export const positiveQuantitySchema = quantitySchema.refine((value) => {
  const parsed = Quantity.tryParse(value);
  return parsed.ok && parsed.value.isPositive();
}, 'Quantity must be greater than zero');

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Query-string integer: plain digits only, so "0x10", "1e1" and " 5 " are rejected. */
function queryInteger(min: number, max: number) {
  return z
    .union([
      z.number(),
      z
        .string()
        .regex(/^\d{1,9}$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(min).max(max));
}

/** Query string of any list endpoint. Values arrive as strings, hence the coercion. */
export const paginationQuerySchema = z.object({
  page: queryInteger(1, MAX_PAGE).default(1),
  pageSize: queryInteger(1, MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/** Response envelope of any list endpoint. */
export function paginatedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
    total: z.number().int().min(0),
  });
}

/** Body of every error response (ADR 0013). The web translates `code`, never `message`. */
export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  requestId: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
