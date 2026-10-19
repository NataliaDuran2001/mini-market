// Drizzle tables of the inventory module (ADR 0005). Re-exported by src/infrastructure/db/schema.ts.
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';
import { products } from '../../catalog/infrastructure/schema';

/**
 * The stock ledger: one signed row per change, never updated or deleted (hard rule 3). `app_user`
 * has no UPDATE or DELETE grant and a trigger rejects them for every role. A correction is a new
 * row. Quantity is in base units (S11). `unit_cost_centavos` is the cost of the units that moved,
 * so the weighted average (S3) can be recomputed from the ledger.
 */
export const stockMovements = tenantTable(
  'stock_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid().notNull(),
    kind: text().notNull(),
    quantity: numeric({ precision: 14, scale: 3 }).notNull(),
    unitCostCentavos: bigint({ mode: 'bigint' }),
    referenceType: text(),
    referenceId: text(),
    reason: text(),
    /** Reserved for v2 (lots module). */
    lotId: uuid(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'stock_movements_kind_check',
      sql`${table.kind} in ('initial', 'purchase', 'sale', 'adjustment', 'void', 'expired')`,
    ),
    check('stock_movements_quantity_not_zero', sql`${table.quantity} <> 0`),
    check(
      'stock_movements_unit_cost_not_negative',
      sql`${table.unitCostCentavos} is null or ${table.unitCostCentavos} >= 0`,
    ),
    check(
      'stock_movements_adjustment_reason',
      sql`${table.kind} <> 'adjustment' or length(btrim(${table.reason})) > 0`,
    ),
    foreignKey({
      name: 'stock_movements_product_fk',
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.id],
    }),
    index('stock_movements_product_idx').on(table.tenantId, table.productId, table.createdAt),
  ],
);

/**
 * Current quantity per product, maintained by `recordMovements` in the same transaction as the
 * movement. Derived data: `inventory:verify` recomputes it from the ledger and reports drift.
 */
export const stockLevels = tenantTable(
  'stock_levels',
  {
    productId: uuid().notNull(),
    quantity: numeric({ precision: 14, scale: 3 }).notNull().default('0'),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'stock_levels_pk', columns: [table.tenantId, table.productId] }),
    foreignKey({
      name: 'stock_levels_product_fk',
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.id],
    }),
  ],
);
