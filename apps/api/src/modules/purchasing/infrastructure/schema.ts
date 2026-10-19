// Drizzle tables of the purchasing module. Re-exported from src/infrastructure/db/schema.ts.
import { sql } from 'drizzle-orm';
import { boolean, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';

/**
 * Who goods are bought from (docs/01-domain.md section 3). Never deleted: `active = false` hides a
 * supplier from the pickers. The name is unique per tenant ignoring case.
 */
export const suppliers = tenantTable(
  'suppliers',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    phone: text(),
    email: text(),
    taxId: text(),
    notes: text(),
    active: boolean().notNull().default(true),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('suppliers_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
  ],
);
