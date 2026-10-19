// Drizzle tables of the catalog module. Re-exported by src/infrastructure/db/schema.ts.
// Catalog rows are never deleted: an item that transactions reference is retired with `is_active`
// (ADR 0007), so `app_user` has no DELETE grant on these tables.
import { sql } from 'drizzle-orm';
import { boolean, check, integer, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
