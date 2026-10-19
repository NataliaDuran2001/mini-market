import { describe, expect, it } from 'vitest';
import {
  createExpenseRequestSchema,
  createRecurringExpenseRequestSchema,
  listExpensesQuerySchema,
  payExpenseRequestSchema,
  updateExpenseRequestSchema,
  updateRecurringExpenseRequestSchema,
} from '../src/payables/index.js';

const CATEGORY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('expense contracts', () => {
  it('takes money as whole positive centavos and the period as YYYY-MM', () => {
    const valid = {
      expenseCategoryId: CATEGORY,
      name: ' Luz ',
      amountCentavos: 20000,
      period: '2026-10',
      dueDate: '2026-11-05',
    };
    expect(createExpenseRequestSchema.parse(valid).name).toBe('Luz');
    for (const bad of [
      { amountCentavos: 0 },
      { amountCentavos: -1 },
      { amountCentavos: 10.5 },
      { amountCentavos: '200.00' },
      { period: '2026-13' },
      { period: '2026-1' },
      { dueDate: '2026-02-30' },
      { name: '  ' },
      { unknownField: 1 },
    ]) {
      expect(
        createExpenseRequestSchema.safeParse({ ...valid, ...bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  it('keeps the due date independent of the period and optional', () => {
    const base = {
      expenseCategoryId: CATEGORY,
      name: 'Alquiler',
      amountCentavos: 150000,
      period: '2026-10',
    };
    expect(createExpenseRequestSchema.safeParse(base).success).toBe(true);
    expect(createExpenseRequestSchema.safeParse({ ...base, dueDate: null }).success).toBe(true);
  });

  it('needs at least one field to update an expense or a template', () => {
    expect(updateExpenseRequestSchema.safeParse({}).success).toBe(false);
    expect(updateExpenseRequestSchema.safeParse({ amountCentavos: 100 }).success).toBe(true);
    expect(updateExpenseRequestSchema.safeParse({ dueDate: null, notes: null }).success).toBe(true);
    expect(updateRecurringExpenseRequestSchema.safeParse({}).success).toBe(false);
    expect(updateRecurringExpenseRequestSchema.safeParse({ endsPeriod: null }).success).toBe(true);
  });

  it('validates a payment and the list query', () => {
    expect(
      payExpenseRequestSchema.safeParse({ amountCentavos: 10000, paymentMethodId: CATEGORY })
        .success,
    ).toBe(true);
    expect(
      payExpenseRequestSchema.safeParse({ amountCentavos: 0, paymentMethodId: CATEGORY }).success,
    ).toBe(false);
    expect(listExpensesQuerySchema.safeParse({ period: '2026-10' }).success).toBe(true);
    expect(listExpensesQuerySchema.safeParse({}).success).toBe(false);
    expect(listExpensesQuerySchema.safeParse({ period: '2026-10', status: 'late' }).success).toBe(
      false,
    );
  });

  it('bounds the due day of a template to 1..31', () => {
    const template = {
      expenseCategoryId: CATEGORY,
      name: 'Alquiler',
      amountCentavos: 150000,
      dayOfMonthDue: 5,
      startsPeriod: '2026-10',
    };
    expect(createRecurringExpenseRequestSchema.safeParse(template).success).toBe(true);
    expect(
      createRecurringExpenseRequestSchema.safeParse({ ...template, dayOfMonthDue: 0 }).success,
    ).toBe(false);
    expect(
      createRecurringExpenseRequestSchema.safeParse({ ...template, dayOfMonthDue: 32 }).success,
    ).toBe(false);
  });
});
