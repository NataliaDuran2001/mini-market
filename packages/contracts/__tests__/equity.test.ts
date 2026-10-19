import { describe, expect, it } from 'vitest';
import {
  capitalSummarySchema,
  listCapitalMovementsQuerySchema,
  recordCapitalMovementRequestSchema,
  recordCapitalMovementResponseSchema,
} from '../src/equity/index.js';

describe('equity contracts', () => {
  it('accepts a contribution and a withdrawal with whole centavos', () => {
    expect(
      recordCapitalMovementRequestSchema.safeParse({
        kind: 'contribution',
        amountCentavos: 1000000,
      }).success,
    ).toBe(true);
    expect(
      recordCapitalMovementRequestSchema.safeParse({
        kind: 'withdrawal',
        amountCentavos: 50000,
        occurredOn: '2026-10-01',
        note: ' retiro para alquiler ',
      }),
    ).toMatchObject({ success: true, data: { note: 'retiro para alquiler' } });
  });

  it.each([
    ['a decimal amount', { kind: 'contribution', amountCentavos: 10.5 }],
    ['a zero amount', { kind: 'contribution', amountCentavos: 0 }],
    ['a negative amount', { kind: 'withdrawal', amountCentavos: -5 }],
    ['an amount as text', { kind: 'contribution', amountCentavos: '1000' }],
    ['an unknown kind', { kind: 'gift', amountCentavos: 100 }],
    ['a malformed day', { kind: 'contribution', amountCentavos: 100, occurredOn: '01/10/2026' }],
    [
      'a note that is too long',
      { kind: 'contribution', amountCentavos: 100, note: 'x'.repeat(501) },
    ],
    ['an unknown field', { kind: 'contribution', amountCentavos: 100, tenantId: 'x' }],
  ])('rejects %s', (_label, body) => {
    expect(recordCapitalMovementRequestSchema.safeParse(body).success).toBe(false);
  });

  it('describes the answer of a record with the warning flag', () => {
    const answer = {
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      kind: 'withdrawal',
      amountCentavos: 100,
      occurredAt: '2026-10-01T04:00:00.000Z',
      note: null,
      createdBy: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      warning: true,
    };
    expect(recordCapitalMovementResponseSchema.safeParse(answer).success).toBe(true);
    expect(
      recordCapitalMovementResponseSchema.safeParse({ ...answer, warning: undefined }).success,
    ).toBe(false);
  });

  it('allows a negative net in the summary but not negative totals', () => {
    expect(
      capitalSummarySchema.safeParse({
        contributedCentavos: 100,
        withdrawnCentavos: 300,
        netCentavos: -200,
      }).success,
    ).toBe(true);
    expect(
      capitalSummarySchema.safeParse({
        contributedCentavos: -1,
        withdrawnCentavos: 0,
        netCentavos: -1,
      }).success,
    ).toBe(false);
  });

  it('paginates the list like every other list endpoint', () => {
    expect(listCapitalMovementsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });
});
