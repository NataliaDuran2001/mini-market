// Drizzle tables of the tenancy module.
//
// `tenants` is the root of the tenant graph: it has no `tenant_id` (its `id` is the tenant id).
// Its row level security policy (`id = app.current_tenant_id()`) arrives with issue #12.
import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique('tenants_slug_unique'),
    name: text().notNull(),
    /** TenantSettings as JSON; validated with the contracts schema on every read (ADR 0006). */
    settings: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('tenants_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
);
