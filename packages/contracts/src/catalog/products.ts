// Product contracts (issue #19, S11, ADR 0004). Money is integer centavos, quantities are decimal
// strings with 3 decimals. The employee shapes carry no cost and no margin (docs/01-domain.md
// section 4): the API picks the shape with `ctx.can('costs.read')`.
import { z } from 'zod';
import {
  moneySchema,
  paginatedSchema,
  paginationQuerySchema,
  quantitySchema,
  uuidSchema,
} from '../common/index.js';

const nameSchema = z.string().trim().min(1).max(120);

/** Product code (barcode, SKU): trimmed, never blank. An empty string means "no code". */
const codeSchema = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value === '' ? null : value));

/** A selling price: a positive whole number of centavos (Bs 0.01 at least). */
export const salePriceSchema = moneySchema.min(1);

/** Stock threshold of the low-stock alert; never negative. */
export const minStockSchema = quantitySchema.refine(
  (value) => !value.startsWith('-'),
  'Minimum stock cannot be negative',
);

export const presentationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  /** Base units in one presentation (S11). Always 1 for the default presentation of v1. */
  factor: z.number().int().min(1),
  salePrice: moneySchema,
  isDefault: z.boolean(),
});

const productBase = {
  id: uuidSchema,
  name: z.string(),
  code: z.string().nullable(),
  categoryId: uuidSchema.nullable(),
  baseUnitId: uuidSchema,
  salePrice: moneySchema,
  minStock: z.string(),
  isActive: z.boolean(),
  presentations: z.array(presentationSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

/** What the owner sees: product plus its average cost and margin per unit. */
export const productOwnerSchema = z.object({
  ...productBase,
  avgCost: moneySchema,
  /** `salePrice - avgCost` in centavos. */
  margin: moneySchema,
});

/** What an employee sees: no `avgCost`, no `margin`. */
export const productEmployeeSchema = z.object(productBase);

/** Either shape. The role decides which one the API sends. */
export const productSchema = z.union([productOwnerSchema, productEmployeeSchema]);

/** `POST /api/v1/products` (owner). Creates the default presentation with factor 1 and the same price. */
export const createProductInputSchema = z.strictObject({
  name: nameSchema,
  code: codeSchema.nullish().transform((value) => value ?? null),
  categoryId: uuidSchema.nullish().transform((value) => value ?? null),
  baseUnitId: uuidSchema,
  salePrice: salePriceSchema,
  minStock: minStockSchema.default('0.000'),
});

/** `PATCH /api/v1/products/:id` (owner). The base unit never changes: stock is counted in it. */
export const updateProductInputSchema = z
  .strictObject({
    name: nameSchema.optional(),
    code: codeSchema.nullable().optional(),
    categoryId: uuidSchema.nullable().optional(),
    salePrice: salePriceSchema.optional(),
    minStock: minStockSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change');

/** `POST /api/v1/products/:id/active` (owner). */
export const setProductActiveInputSchema = z.strictObject({ isActive: z.boolean() });

/** `GET /api/v1/products` query. */
export const searchProductsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: uuidSchema.optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const searchProductsResponseSchema = paginatedSchema(productSchema);

export type PresentationData = z.infer<typeof presentationSchema>;
export type ProductOwner = z.infer<typeof productOwnerSchema>;
export type ProductEmployee = z.infer<typeof productEmployeeSchema>;
export type Product = z.infer<typeof productSchema>;
export type CreateProductInput = z.input<typeof createProductInputSchema>;
export type UpdateProductInput = z.input<typeof updateProductInputSchema>;
export type SetProductActiveInput = z.infer<typeof setProductActiveInputSchema>;
export type SearchProductsQuery = z.infer<typeof searchProductsQuerySchema>;
export type SearchProductsResponse = z.infer<typeof searchProductsResponseSchema>;
export type CreateProductData = z.output<typeof createProductInputSchema>;
export type UpdateProductData = z.output<typeof updateProductInputSchema>;
