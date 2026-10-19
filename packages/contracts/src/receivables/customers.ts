// Customer and credit ledger contracts of the receivables module (issue #56, S6).
// Import as `@mini-market/contracts/receivables`.
import { z } from 'zod';
import { moneySchema, uuidSchema } from '../common/index.js';

const NAME_MAX = 120;
const PHONE_MAX = 40;
const DOCUMENT_MAX = 40;
const NOTES_MAX = 1000;

/** How a collection was paid. Credit is not a way to pay a debt, so it is not offered. */
export const COLLECTION_METHODS = ['cash', 'transfer', 'qr', 'card'] as const;
export const collectionMethodSchema = z.enum(COLLECTION_METHODS);

export const LEDGER_KINDS = ['charge', 'payment', 'reversal'] as const;
export const ledgerKindSchema = z.enum(LEDGER_KINDS);

const customerName = z.string().trim().min(1).max(NAME_MAX);

/** Optional text field: blank means "none", so a form can send an empty input as it is. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Credit limit in centavos; `null` is "no limit". Zero is a customer who may not buy on credit. */
const creditLimit = moneySchema.min(0).nullable();

/** A calendar day in the tenant timezone, "YYYY-MM-DD". The API rejects impossible days. */
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Day must be YYYY-MM-DD');

export const customerSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  phone: z.string().nullable(),
  documentId: z.string().nullable(),
  creditLimitCentavos: creditLimit,
  notes: z.string().nullable(),
  active: z.boolean(),
});

/**
 * `POST /api/v1/customers` (`receivables.collect`). `creditLimitCentavos` needs
 * `receivables.manage`: an employee who sends it gets 403.
 */
export const createCustomerRequestSchema = z.strictObject({
  name: customerName,
  phone: optionalText(PHONE_MAX),
  documentId: optionalText(DOCUMENT_MAX),
  creditLimitCentavos: creditLimit.optional(),
  notes: optionalText(NOTES_MAX),
});

const UPDATE_KEYS = [
  'name',
  'phone',
  'documentId',
  'creditLimitCentavos',
  'notes',
  'active',
] as const;

/**
 * `PATCH /api/v1/customers/:id`: only the keys sent change; `null` or blank clears an optional
 * field. The credit limit and `active` need `receivables.manage`.
 */
export const updateCustomerRequestSchema = z
  .strictObject({
    name: customerName.optional(),
    phone: optionalText(PHONE_MAX),
    documentId: optionalText(DOCUMENT_MAX),
    creditLimitCentavos: creditLimit.optional(),
    notes: optionalText(NOTES_MAX),
    active: z.boolean().optional(),
  })
  .refine((body) => UPDATE_KEYS.some((key) => body[key] !== undefined), {
    message: 'Send at least one field to change',
  });

/** `GET /api/v1/customers?q=&active=`: `q` matches name, phone and document. */
export const listCustomersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const listCustomersResponseSchema = z.object({ items: z.array(customerSchema) });

/**
 * One line of the credit ledger. `amountCentavos` is signed: a charge is positive (the customer
 * owes more), a payment or a reversal is negative. `balanceAfterCentavos` is the running balance.
 */
export const ledgerLineSchema = z.object({
  id: uuidSchema,
  kind: ledgerKindSchema,
  amountCentavos: moneySchema,
  balanceAfterCentavos: moneySchema,
  occurredAt: z.iso.datetime(),
  referenceType: z.string().nullable(),
  referenceId: uuidSchema.nullable(),
  paymentMethod: collectionMethodSchema.nullable(),
  createdBy: uuidSchema,
});

/** `GET /api/v1/customers/:id/statement`: the ledger in order, oldest first. */
export const customerStatementSchema = z.object({
  customer: customerSchema,
  balanceCentavos: moneySchema,
  lines: z.array(ledgerLineSchema),
});

/**
 * `POST /api/v1/customers/:id/collections` (`receivables.collect`). A collection is money in
 * against the balance, never revenue (S6). `occurredOn` defaults to today in the tenant timezone
 * and cannot be in the future.
 */
export const registerCollectionRequestSchema = z.strictObject({
  amountCentavos: moneySchema.positive(),
  method: collectionMethodSchema,
  occurredOn: dayKeySchema.optional(),
});

export const registerCollectionResponseSchema = z.object({
  line: ledgerLineSchema,
  balanceCentavos: moneySchema,
});

/** `GET /api/v1/receivables?q=&withBalance=`: customers with what they owe, biggest debt first. */
export const listReceivablesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  withBalance: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const receivableSchema = z.object({
  customer: customerSchema,
  balanceCentavos: moneySchema,
  /**
   * Days since the oldest charge that payments have not covered yet (oldest charges are paid
   * first), counted in tenant days. `null` when the customer owes nothing.
   */
  overdueDays: z.number().int().min(0).nullable(),
});

export const listReceivablesResponseSchema = z.object({
  items: z.array(receivableSchema),
  /** Sum of the positive balances: what customers owe the business (S6, informational). */
  totalPendingCentavos: moneySchema.min(0),
});

export type CollectionMethod = z.infer<typeof collectionMethodSchema>;
export type LedgerKind = z.infer<typeof ledgerKindSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type ListCustomersResponse = z.infer<typeof listCustomersResponseSchema>;
export type LedgerLine = z.infer<typeof ledgerLineSchema>;
export type CustomerStatement = z.infer<typeof customerStatementSchema>;
export type RegisterCollectionRequest = z.input<typeof registerCollectionRequestSchema>;
export type RegisterCollectionResponse = z.infer<typeof registerCollectionResponseSchema>;
export type ListReceivablesQuery = z.infer<typeof listReceivablesQuerySchema>;
export type Receivable = z.infer<typeof receivableSchema>;
export type ListReceivablesResponse = z.infer<typeof listReceivablesResponseSchema>;
