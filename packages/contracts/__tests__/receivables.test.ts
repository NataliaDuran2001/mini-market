import { describe, expect, it } from 'vitest';
import {
  createCustomerRequestSchema,
  customerStatementSchema,
  listReceivablesQuerySchema,
  registerCollectionRequestSchema,
  updateCustomerRequestSchema,
} from '../src/receivables/index.js';

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('receivables contracts', () => {
  it('trims a customer and turns blank optional fields into null', () => {
    expect(
      createCustomerRequestSchema.safeParse({
        name: '  Doña Rosa ',
        phone: ' ',
        creditLimitCentavos: 10_000,
      }),
    ).toMatchObject({
      success: true,
      data: { name: 'Doña Rosa', phone: null, creditLimitCentavos: 10_000 },
    });
  });

  it.each([
    ['a blank name', { name: '  ' }],
    ['a decimal limit', { name: 'A', creditLimitCentavos: 10.5 }],
    ['a negative limit', { name: 'A', creditLimitCentavos: -1 }],
    ['an unknown field', { name: 'A', tenantId: ID }],
  ])('rejects a customer with %s', (_label, body) => {
    expect(createCustomerRequestSchema.safeParse(body).success).toBe(false);
  });

  it('allows clearing the limit with null and refuses an empty patch', () => {
    expect(updateCustomerRequestSchema.safeParse({ creditLimitCentavos: null }).success).toBe(true);
    expect(updateCustomerRequestSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    ['a zero amount', { amountCentavos: 0, method: 'cash' }],
    ['a decimal amount', { amountCentavos: 10.5, method: 'cash' }],
    ['credit as the method', { amountCentavos: 100, method: 'credit' }],
    ['a malformed day', { amountCentavos: 100, method: 'cash', occurredOn: '1/1/2026' }],
  ])('rejects a collection with %s', (_label, body) => {
    expect(registerCollectionRequestSchema.safeParse(body).success).toBe(false);
  });

  it('accepts a collection and parses the withBalance query', () => {
    expect(
      registerCollectionRequestSchema.safeParse({
        amountCentavos: 2_000,
        method: 'qr',
        occurredOn: '2026-10-15',
      }).success,
    ).toBe(true);
    expect(listReceivablesQuerySchema.parse({ withBalance: 'true' })).toEqual({
      withBalance: true,
    });
  });

  it('describes a statement with signed lines and the running balance', () => {
    const customer = {
      id: ID,
      name: 'Rosa',
      phone: null,
      documentId: null,
      creditLimitCentavos: null,
      notes: null,
      active: true,
    };
    const line = {
      id: ID,
      kind: 'payment',
      amountCentavos: -2_000,
      balanceAfterCentavos: 6_000,
      occurredAt: '2026-10-15T14:00:00.000Z',
      referenceType: null,
      referenceId: null,
      paymentMethod: 'cash',
      createdBy: ID,
    };
    expect(
      customerStatementSchema.safeParse({ customer, balanceCentavos: 6_000, lines: [line] }).success,
    ).toBe(true);
  });
});
