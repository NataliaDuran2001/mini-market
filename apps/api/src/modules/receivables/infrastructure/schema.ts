// Drizzle tables of the receivables module. Re-exported from src/infrastructure/db/schema.ts.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenantTable } from '../../../infrastructure/db/tenant-table';

/**
 * Who buys "al fiado" (docs/01-domain.md section 3). Never deleted: `active = false` stops new
 * charges and keeps the history. What a customer owes is not stored here, it is the sum of its
 * lines in `credit_ledger`.
 */
export const customers = tenantTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    phone: text(),
    documentId: text(),
    /** Integer centavos of BOB; null is "no limit" (ADR 0004). */
    creditLimitCentavos: bigint({ mode: 'bigint' }),
    notes: text(),
    active: boolean().notNull().default(true),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Target of the composite foreign key of the ledger: a line can only point at a customer of
    // its own tenant.
    unique('customers_tenant_id_id_key').on(table.tenantId, table.id),
    check('customers_credit_limit_check', sql`${table.creditLimitCentavos} >= 0`),
    index('customers_tenant_name_idx').on(table.tenantId, sql`lower(${table.name})`),
  ],
);

/**
 * Credit ledger of a tenant (S6, ADR 0005). Append-only: `app_user` has only SELECT and INSERT,
 * and a trigger rejects UPDATE and DELETE for every role (migration `receivables_customers_ledger`).
 * A correction is a new line. Row level security on `tenant_id`.
 */
export const creditLedger = tenantTable(
  'credit_ledger',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Write order: breaks ties between lines of the same instant. */
    seq: bigint({ mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    customerId: uuid().notNull(),
    kind: text().notNull(),
    /** Signed centavos: positive for a charge, negative for a payment or a reversal. */
    amountCentavos: bigint({ mode: 'bigint' }).notNull(),
    referenceType: text(),
    referenceId: uuid(),
    /** Only on payments: how the customer paid. */
    paymentMethod: text(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    createdBy: uuid().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: 'credit_ledger_customer_fk',
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }),
    check('credit_ledger_kind_check', sql`${table.kind} in ('charge', 'payment', 'reversal')`),
    check(
      'credit_ledger_amount_check',
      sql`(${table.kind} = 'charge' and ${table.amountCentavos} > 0) or (${table.kind} <> 'charge' and ${table.amountCentavos} < 0)`,
    ),
    check(
      'credit_ledger_reference_check',
      sql`(${table.referenceType} is null) = (${table.referenceId} is null)`,
    ),
    check(
      'credit_ledger_payment_method_check',
      sql`(${table.kind} = 'payment' and ${table.paymentMethod} is not null and ${table.paymentMethod} in ('cash', 'transfer', 'qr', 'card')) or (${table.kind} <> 'payment' and ${table.paymentMethod} is null)`,
    ),
    // A charge and its reversal always point at a sale; a payment never does.
    check(
      'credit_ledger_reference_kind_check',
      sql`(${table.kind} = 'payment' and ${table.referenceId} is null) or (${table.kind} <> 'payment' and ${table.referenceId} is not null)`,
    ),
    index('credit_ledger_tenant_customer_idx').on(
      table.tenantId,
      table.customerId,
      table.occurredAt,
      table.seq,
    ),
    // A sale is charged once and reversed once.
    uniqueIndex('credit_ledger_charge_reference_idx')
      .on(table.tenantId, table.referenceType, table.referenceId)
      .where(sql`${table.kind} = 'charge' and ${table.referenceId} is not null`),
    uniqueIndex('credit_ledger_reversal_reference_idx')
      .on(table.tenantId, table.referenceType, table.referenceId)
      .where(sql`${table.kind} = 'reversal' and ${table.referenceId} is not null`),
  ],
);
