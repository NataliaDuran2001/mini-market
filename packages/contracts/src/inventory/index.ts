// Inventory contracts (issue #20, ADR 0005, S12, S13). Import as `@mini-market/contracts/inventory`.
// Quantities are decimal strings with 3 decimals, money is integer centavos. Movements reach the
// employee without `unitCost` (docs/01-domain.md section 4): the API picks the shape.
import { z } from 'zod';
import {
  moneySchema,
  paginatedSchema,
  paginationQuerySchema,
  positiveQuantitySchema,
  quantitySchema,
  uuidSchema,
} from '../common/index.js';

export const MOVEMENT_KINDS = [
  'initial',
  'purchase',
  'sale',
  'adjustment',
  'void',
  'expired',
] as const;
export const movementKindSchema = z.enum(MOVEMENT_KINDS);

export const stockLevelSchema = z.object({
  productId: uuidSchema,
  quantity: z.string(),
  updatedAt: z.iso.datetime(),
});

const movementBase = {
  id: uuidSchema,
  productId: uuidSchema,
  kind: movementKindSchema,
  /** Signed, in base units. */
  quantity: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  reason: z.string().nullable(),
  createdBy: uuidSchema,
  createdAt: z.iso.datetime(),
};

export const stockMovementOwnerSchema = z.object({
  ...movementBase,
  unitCost: moneySchema.nullable(),
});
export const stockMovementEmployeeSchema = z.object(movementBase);
export const stockMovementSchema = z.union([stockMovementOwnerSchema, stockMovementEmployeeSchema]);

export const lowStockItemSchema = z.object({
  productId: uuidSchema,
  name: z.string(),
  code: z.string().nullable(),
  quantity: z.string(),
  minStock: z.string(),
});

const REASON_MAX = 200;

/** `POST /api/v1/inventory/adjustments` (owner): a signed change in base units, with a reason. */
export const adjustStockInputSchema = z.strictObject({
  productId: uuidSchema,
  delta: quantitySchema.refine((value) => !/^-?0*\.?0*$/.test(value), 'Delta cannot be zero'),
  reason: z.string().trim().min(1).max(REASON_MAX),
});

/** `POST /api/v1/inventory/initial` (owner): the opening stock of a product that has no movements. */
export const setInitialStockInputSchema = z.strictObject({
  productId: uuidSchema,
  quantity: positiveQuantitySchema,
  unitCost: moneySchema.min(0),
});

const MAX_IDS = 100;

/** `GET /api/v1/inventory/levels`: one product, a list of products, or every level, paged. */
export const listStockLevelsQuerySchema = paginationQuerySchema.extend({
  productId: uuidSchema.optional(),
  productIds: z
    .string()
    .transform((value) => value.split(',').filter((id) => id !== ''))
    .pipe(z.array(uuidSchema).max(MAX_IDS))
    .optional(),
});

/** `GET /api/v1/inventory/movements`: newest first. */
export const listMovementsQuerySchema = paginationQuerySchema.extend({ productId: uuidSchema });

/** `GET /api/v1/inventory/low-stock` */
export const lowStockQuerySchema = paginationQuerySchema;

export const listStockLevelsResponseSchema = paginatedSchema(stockLevelSchema);
export const listMovementsResponseSchema = paginatedSchema(stockMovementSchema);
export const lowStockResponseSchema = paginatedSchema(lowStockItemSchema);

export type MovementKind = z.infer<typeof movementKindSchema>;
export type StockLevel = z.infer<typeof stockLevelSchema>;
export type StockMovementOwner = z.infer<typeof stockMovementOwnerSchema>;
export type StockMovementEmployee = z.infer<typeof stockMovementEmployeeSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type LowStockItem = z.infer<typeof lowStockItemSchema>;
export type AdjustStockInput = z.output<typeof adjustStockInputSchema>;
export type SetInitialStockInput = z.output<typeof setInitialStockInputSchema>;
export type ListStockLevelsQuery = z.output<typeof listStockLevelsQuerySchema>;
export type ListMovementsQuery = z.output<typeof listMovementsQuerySchema>;
export type LowStockQuery = z.output<typeof lowStockQuerySchema>;
export type ListStockLevelsResponse = z.infer<typeof listStockLevelsResponseSchema>;
export type ListMovementsResponse = z.infer<typeof listMovementsResponseSchema>;
export type LowStockResponse = z.infer<typeof lowStockResponseSchema>;
