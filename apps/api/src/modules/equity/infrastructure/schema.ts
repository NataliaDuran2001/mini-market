import { sql } from 'drizzle-orm';
import { bigint, check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';

/**
 * Capital ledger of a tenant (S8, docs/01-domain.md section 3). Append-only: `app_user` has only
 * SELECT and INSERT, and a trigger rejects UPDATE and DELETE for every role (migration
 * `equity_capital_movements`). A correction is a new movement. Row level security on `tenant_id`.
 */
export const capitalMovements = tenantTable(
  'capital_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    /** Integer centavos of BOB, always positive; `kind` gives the direction (ADR 0004). */
    amountCentavos: bigint({ mode: 'bigint' }).notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    note: text(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('capital_movements_kind_check', sql`${table.kind} in ('contribution', 'withdrawal')`),
    check('capital_movements_amount_check', sql`${table.amountCentavos} > 0`),
    check('capital_movements_note_check', sql`char_length(${table.note}) <= 500`),
    index('capital_movements_tenant_occurred_idx').on(table.tenantId, table.occurredAt),
  ],
);
