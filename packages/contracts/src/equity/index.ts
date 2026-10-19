// Contracts of the equity module: owner capital (S8). Import as `@mini-market/contracts/equity`.
// Owner only: no employee ever receives these shapes (docs/01-domain.md section 4).
import { z } from 'zod';
import {
  moneySchema,
  paginatedSchema,
  paginationQuerySchema,
  uuidSchema,
} from '../common/index.js';

export const CAPITAL_MOVEMENT_KINDS = ['contribution', 'withdrawal'] as const;
export const MAX_NOTE_LENGTH = 500;

export const capitalMovementKindSchema = z.enum(CAPITAL_MOVEMENT_KINDS);

/** A calendar day in the tenant timezone, "YYYY-MM-DD". The API rejects impossible days. */
const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Day must be YYYY-MM-DD');

/**
 * `POST /api/v1/capital/movements` (owner only). `amountCentavos` is a positive whole number of
 * centavos; the kind decides the sign. `occurredOn` defaults to today in the tenant timezone.
 */
export const recordCapitalMovementRequestSchema = z.strictObject({
  kind: capitalMovementKindSchema,
  amountCentavos: moneySchema.positive(),
  occurredOn: dayKeySchema.optional(),
  /** An empty note is stored as no note. */
  note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

export const capitalMovementSchema = z.object({
  id: uuidSchema,
  kind: capitalMovementKindSchema,
  amountCentavos: moneySchema.positive(),
  occurredAt: z.iso.datetime(),
  note: z.string().nullable(),
  createdBy: uuidSchema,
});

/**
 * Answer of the POST. `warning` is true when the withdrawal left the net capital below zero: it is
 * allowed (the owner decides) but the screen tells them.
 */
export const recordCapitalMovementResponseSchema = capitalMovementSchema.extend({
  warning: z.boolean(),
});

/** `GET /api/v1/capital/movements`, newest first. */
export const listCapitalMovementsQuerySchema = paginationQuerySchema;
export const listCapitalMovementsResponseSchema = paginatedSchema(capitalMovementSchema);

/** `GET /api/v1/capital/summary` (S8): `net = contributed - withdrawn`, negative when over-withdrawn. */
export const capitalSummarySchema = z.object({
  contributedCentavos: moneySchema.min(0),
  withdrawnCentavos: moneySchema.min(0),
  netCentavos: moneySchema,
});

export type CapitalMovementKind = z.infer<typeof capitalMovementKindSchema>;
export type RecordCapitalMovementRequest = z.input<typeof recordCapitalMovementRequestSchema>;
export type CapitalMovement = z.infer<typeof capitalMovementSchema>;
export type RecordCapitalMovementResponse = z.infer<typeof recordCapitalMovementResponseSchema>;
export type ListCapitalMovementsResponse = z.infer<typeof listCapitalMovementsResponseSchema>;
export type CapitalSummary = z.infer<typeof capitalSummarySchema>;
