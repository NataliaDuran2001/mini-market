// Drizzle tables of the catalog module. Re-exported by src/infrastructure/db/schema.ts.
// Catalog rows are never deleted: an item that transactions reference is retired with `is_active`
// (ADR 0007), so `app_user` has no DELETE grant on these tables.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';

const commonColumns = () => ({
  id: uuid().primaryKey().defaultRandom(),
  isActive: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const categories = tenantTable(
  'categories',
  { ...commonColumns(), name: text().notNull() },
  (table) => [
    check('categories_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    uniqueIndex('categories_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
    // Target of the composite foreign key of products: a product cannot point at another tenant.
    uniqueIndex('categories_tenant_id_id_idx').on(table.tenantId, table.id),
  ],
);

export const units = tenantTable(
  'units',
  {
    ...commonColumns(),
    code: text().notNull(),
    name: text().notNull(),
    allowsDecimals: boolean().notNull().default(false),
  },
  (table) => [
    check('units_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    uniqueIndex('units_tenant_code_idx').on(table.tenantId, table.code),
    uniqueIndex('units_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
    uniqueIndex('units_tenant_id_id_idx').on(table.tenantId, table.id),
  ],
);

export const paymentMethods = tenantTable(
  'payment_methods',
  {
    ...commonColumns(),
    code: text().notNull(),
    name: text().notNull(),
    kind: text().notNull(),
  },
  (table) => [
    check('payment_methods_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check(
      'payment_methods_kind_check',
      sql`${table.kind} in ('cash', 'transfer', 'qr', 'card', 'credit')`,
    ),
    uniqueIndex('payment_methods_tenant_code_idx').on(table.tenantId, table.code),
    uniqueIndex('payment_methods_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
  ],
);

export const expenseCategories = tenantTable(
  'expense_categories',
  {
    ...commonColumns(),
    name: text().notNull(),
    isFixed: boolean().notNull().default(false),
  },
  (table) => [
    check('expense_categories_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    uniqueIndex('expense_categories_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
  ],
);

/**
 * The product master (S11). Money columns are bigint centavos (ADR 0004). `avg_cost_centavos` is
 * owned by inventory (S3): purchases and the initial stock write it, nothing else does. The
 * composite foreign keys include `tenant_id`, so a product can only point at a category and a unit
 * of its own tenant even though foreign key checks bypass row level security.
 */
export const products = tenantTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    code: text(),
    categoryId: uuid(),
    baseUnitId: uuid().notNull(),
    salePriceCentavos: bigint({ mode: 'bigint' }).notNull(),
    avgCostCentavos: bigint({ mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    minStock: numeric({ precision: 14, scale: 3 }).notNull().default('0'),
    isActive: boolean().notNull().default(true),
    /** Reserved for v2 (custom fields module). */
    attributes: jsonb().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('products_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('products_sale_price_positive', sql`${table.salePriceCentavos} > 0`),
    check('products_avg_cost_not_negative', sql`${table.avgCostCentavos} >= 0`),
    check('products_min_stock_not_negative', sql`${table.minStock} >= 0`),
    foreignKey({
      name: 'products_category_fk',
      columns: [table.tenantId, table.categoryId],
      foreignColumns: [categories.tenantId, categories.id],
    }),
    foreignKey({
      name: 'products_base_unit_fk',
      columns: [table.tenantId, table.baseUnitId],
      foreignColumns: [units.tenantId, units.id],
    }),
    uniqueIndex('products_tenant_code_idx')
      .on(table.tenantId, sql`lower(${table.code})`)
      .where(sql`${table.code} is not null`),
    index('products_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
    uniqueIndex('products_tenant_id_id_idx').on(table.tenantId, table.id),
  ],
);

/**
 * Sellable units of a product with a factor to the base unit (S11). In v1 every product has one
 * presentation, the default one, with factor 1 and the product's price.
 */
export const productPresentations = tenantTable(
  'product_presentations',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid().notNull(),
    name: text().notNull(),
    factor: integer().notNull(),
    salePriceCentavos: bigint({ mode: 'bigint' }).notNull(),
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('product_presentations_factor_positive', sql`${table.factor} >= 1`),
    check('product_presentations_price_positive', sql`${table.salePriceCentavos} > 0`),
    foreignKey({
      name: 'product_presentations_product_fk',
      columns: [table.tenantId, table.productId],
      foreignColumns: [products.tenantId, products.id],
    }),
    index('product_presentations_product_idx').on(table.tenantId, table.productId),
    // At most one default presentation per product.
    uniqueIndex('product_presentations_default_idx')
      .on(table.productId)
      .where(sql`${table.isDefault}`),
  ],
);
