import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Mirror of the Supabase auth users the API has seen. `id` is the auth user id. Not tenant data:
 * a person can belong to several tenants.
 */
export const users = pgTable('users', {
  id: uuid().primaryKey(),
  email: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pending and consumed invitations. Has `tenant_id` but is read by token before the invitee has a
 * membership, so it is not under the tenant RLS policy (issue #12 lists it as an exception).
 * `tenant_id` gets its foreign key to `tenants` once that table exists (issue #11).
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().notNull(),
    email: text().notNull(),
    role: text().notNull(),
    tokenHash: text().notNull().unique(),
    invitedBy: uuid()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('invitations_role_check', sql`${table.role} in ('owner', 'employee')`),
    index('invitations_tenant_id_idx').on(table.tenantId),
    uniqueIndex('invitations_pending_email_idx')
      .on(table.tenantId, table.email)
      .where(sql`${table.consumedAt} is null`),
  ],
);
