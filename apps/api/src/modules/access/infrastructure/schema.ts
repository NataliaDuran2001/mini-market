import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';
import { tenants } from '../../tenancy/infrastructure/schema';

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
 * Link between a user and a tenant with a role (docs/01-domain.md section 3). Rows are never
 * deleted: a member who leaves is `disabled`. Under row level security: a transaction sees the
 * rows of its tenant, and a user also sees their own rows to pick a tenant (migration `rls_app_user`).
 */
export const memberships = tenantTable(
  'memberships',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    role: text().notNull(),
    status: text().notNull().default('active'),
    invitedBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('memberships_role_check', sql`${table.role} in ('owner', 'employee')`),
    check('memberships_status_check', sql`${table.status} in ('active', 'disabled')`),
    uniqueIndex('memberships_tenant_user_idx').on(table.tenantId, table.userId),
    index('memberships_user_idx').on(table.userId),
  ],
);

/**
 * Pending and consumed invitations. Has `tenant_id` but is read by token before the invitee has a
 * membership, so it is not under the tenant RLS policy (issue #12 lists it as an exception).
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    email: text().notNull(),
    role: text().notNull(),
    tokenHash: text().notNull(),
    invitedBy: uuid()
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('invitations_role_check', sql`${table.role} in ('owner', 'employee')`),
    check('invitations_email_lowercase_check', sql`${table.email} = lower(${table.email})`),
    index('invitations_tenant_id_idx').on(table.tenantId),
    uniqueIndex('invitations_token_hash_idx').on(table.tokenHash),
    uniqueIndex('invitations_pending_email_idx')
      .on(table.tenantId, table.email)
      .where(sql`${table.consumedAt} is null`),
  ],
);

/**
 * Append-only log of sensitive actions (docs/05-security.md section 3). A trigger rejects UPDATE
 * and DELETE (migration `audit_log_append_only`); corrections are new rows. Has `tenant_id` but
 * is written by use cases of every module, so the RLS decision is made in issue #12.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    /** Null for actions without a user, such as the operator provisioning script. */
    actorUserId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_log_tenant_at_idx').on(table.tenantId, table.at)],
);
