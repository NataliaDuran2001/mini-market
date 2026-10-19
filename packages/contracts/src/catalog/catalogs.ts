// Catalog contracts (issue #18, ADR 0007): categories, units, payment methods and expense
// categories. One generic endpoint family keyed by `kind`.
import { z } from 'zod';
import { uuidSchema } from '../common/index.js';

/** Path segment of `/api/v1/catalogs/:kind`. */
export const CATALOG_KINDS = [
  'categories',
  'units',
  'payment-methods',
  'expense-categories',
] as const;
export const catalogKindSchema = z.enum(CATALOG_KINDS);

export const PAYMENT_METHOD_KINDS = ['cash', 'transfer', 'qr', 'card', 'credit'] as const;
export const paymentMethodKindSchema = z.enum(PAYMENT_METHOD_KINDS);

const MAX_SORT_ORDER = 10_000;

const nameSchema = z.string().trim().min(1).max(80);
/** Stable machine name of a unit or payment method: `unidad`, `kg`, `qr`. */
const codeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, 'Lowercase letters, digits and _');
const sortOrderSchema = z.number().int().min(0).max(MAX_SORT_ORDER);

const itemBase = {
  id: uuidSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
};

// Strict so that a union of the four never matches the wrong kind and strips fields silently.
export const categoryItemSchema = z.strictObject({ ...itemBase, name: z.string() });
export const unitItemSchema = z.strictObject({
  ...itemBase,
  code: z.string(),
  name: z.string(),
  allowsDecimals: z.boolean(),
});
export const paymentMethodItemSchema = z.strictObject({
  ...itemBase,
  code: z.string(),
  name: z.string(),
  kind: paymentMethodKindSchema,
});
export const expenseCategoryItemSchema = z.strictObject({
  ...itemBase,
  name: z.string(),
  isFixed: z.boolean(),
});

export const catalogItemSchemas = {
  categories: categoryItemSchema,
  units: unitItemSchema,
  'payment-methods': paymentMethodItemSchema,
  'expense-categories': expenseCategoryItemSchema,
} as const;

export const catalogItemSchema = z.union([
  categoryItemSchema,
  unitItemSchema,
  paymentMethodItemSchema,
  expenseCategoryItemSchema,
]);

/** `GET /api/v1/catalogs/:kind` */
export const listCatalogResponseSchema = z.object({ items: z.array(catalogItemSchema) });

/** Query of the list: pickers ask for `activeOnly=true`, the management screen for everything. */
export const listCatalogQuerySchema = z.object({
  activeOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const createCategoryInputSchema = z.strictObject({
  name: nameSchema,
  sortOrder: sortOrderSchema.default(0),
});
export const createUnitInputSchema = z.strictObject({
  code: codeSchema,
  name: nameSchema,
  allowsDecimals: z.boolean().default(false),
  sortOrder: sortOrderSchema.default(0),
});
export const createPaymentMethodInputSchema = z.strictObject({
  code: codeSchema,
  name: nameSchema,
  kind: paymentMethodKindSchema,
  sortOrder: sortOrderSchema.default(0),
});
export const createExpenseCategoryInputSchema = z.strictObject({
  name: nameSchema,
  isFixed: z.boolean().default(false),
  sortOrder: sortOrderSchema.default(0),
});

/** `POST /api/v1/catalogs/:kind` body, by kind. */
export const createCatalogItemInputSchemas = {
  categories: createCategoryInputSchema,
  units: createUnitInputSchema,
  'payment-methods': createPaymentMethodInputSchema,
  'expense-categories': createExpenseCategoryInputSchema,
} as const;

const atLeastOneKey = (value: object): boolean => Object.keys(value).length > 0;
const EMPTY_PATCH = 'Send at least one field to change';

// `code` and the payment method `kind` are not editable: reports and the credit flow rely on them.
export const updateCategoryInputSchema = z
  .strictObject({
    name: nameSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneKey, EMPTY_PATCH);
export const updateUnitInputSchema = z
  .strictObject({
    name: nameSchema.optional(),
    allowsDecimals: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneKey, EMPTY_PATCH);
export const updatePaymentMethodInputSchema = z
  .strictObject({
    name: nameSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneKey, EMPTY_PATCH);
export const updateExpenseCategoryInputSchema = z
  .strictObject({
    name: nameSchema.optional(),
    isFixed: z.boolean().optional(),
    sortOrder: sortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneKey, EMPTY_PATCH);

/** `PATCH /api/v1/catalogs/:kind/:id` body, by kind. `isActive: false` is how an item is retired. */
export const updateCatalogItemInputSchemas = {
  categories: updateCategoryInputSchema,
  units: updateUnitInputSchema,
  'payment-methods': updatePaymentMethodInputSchema,
  'expense-categories': updateExpenseCategoryInputSchema,
} as const;

export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type PaymentMethodKind = z.infer<typeof paymentMethodKindSchema>;
export type CategoryItem = z.infer<typeof categoryItemSchema>;
export type UnitItem = z.infer<typeof unitItemSchema>;
export type PaymentMethodItem = z.infer<typeof paymentMethodItemSchema>;
export type ExpenseCategoryItem = z.infer<typeof expenseCategoryItemSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type ListCatalogQuery = z.infer<typeof listCatalogQuerySchema>;
export type CreateCatalogItemInput = {
  [K in CatalogKind]: z.input<(typeof createCatalogItemInputSchemas)[K]>;
}[CatalogKind];
export type UpdateCatalogItemInput = {
  [K in CatalogKind]: z.input<(typeof updateCatalogItemInputSchemas)[K]>;
}[CatalogKind];
