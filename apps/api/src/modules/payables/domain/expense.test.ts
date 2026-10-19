import { Money } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import { balanceOf, changeAmount, registerPayment, statusFor, totalsOf } from './expense';

const bs = (value: number) => Money.fromCentavos(value * 100);

describe('expense payment state machine', () => {
  it('is pending with nothing paid, partial with something paid, paid with the whole amount', () => {
    // AC-2
    expect(statusFor(bs(300), bs(0))).toBe('pending');
    expect(statusFor(bs(300), bs(100))).toBe('partial');
    expect(statusFor(bs(300), bs(300))).toBe('paid');
  });

  it('moves pending to partial to paid with two payments', () => {
    // AC-2
    const first = registerPayment({ amount: bs(300), paid: bs(0) }, bs(100));
    expect(first.ok && first.value.status).toBe('partial');
    expect(first.ok && first.value.paid.toCentavos()).toBe(10000n);

    const second = registerPayment({ amount: bs(300), paid: bs(100) }, bs(200));
    expect(second.ok && second.value.status).toBe('paid');
  });

  it('refuses a payment above the balance, and any payment of a paid expense', () => {
    // AC-2
    const over = registerPayment({ amount: bs(300), paid: bs(100) }, bs(250));
    expect(!over.ok && over.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    expect(!over.ok && over.error.details).toEqual({ balanceCentavos: 20000 });
    const paid = registerPayment({ amount: bs(300), paid: bs(300) }, Money.fromCentavos(1));
    expect(!paid.ok && paid.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
  });

  it('computes the balance in centavos without rounding', () => {
    expect(
      balanceOf({ amount: Money.fromCentavos(1005), paid: Money.fromCentavos(1) }).toCentavos(),
    ).toBe(1004n);
  });
});

describe('changing the amount of an expense', () => {
  it('is refused once paid', () => {
    // AC-3
    const result = changeAmount({ status: 'paid', paid: bs(300) }, bs(400));
    expect(!result.ok && result.error.code).toBe('EXPENSE_PAID');
  });

  it('is allowed while pending or partial, never below what was paid', () => {
    const pending = changeAmount({ status: 'pending', paid: bs(0) }, bs(500));
    expect(pending.ok && pending.value.status).toBe('pending');
    const partial = changeAmount({ status: 'partial', paid: bs(100) }, bs(150));
    expect(partial.ok && partial.value.status).toBe('partial');
    const below = changeAmount({ status: 'partial', paid: bs(100) }, bs(99));
    expect(!below.ok && below.error.code).toBe('AMOUNT_BELOW_PAID');
  });

  it('turns a partial expense into paid when the new amount equals what was paid', () => {
    const result = changeAmount({ status: 'partial', paid: bs(100) }, bs(100));
    expect(result.ok && result.value.status).toBe('paid');
  });
});

describe('totals of a period', () => {
  it('adds accrued and paid, pending is the difference (S2, S5)', () => {
    const totals = totalsOf([
      { amount: bs(1500), paid: bs(1500) },
      { amount: bs(200), paid: bs(50) },
      { amount: bs(150), paid: bs(0) },
    ]);
    expect(totals.accrued.toCentavos()).toBe(185000n);
    expect(totals.paid.toCentavos()).toBe(155000n);
    expect(totals.pending.toCentavos()).toBe(30000n);
  });

  it('is zero for no expenses', () => {
    expect(totalsOf([]).accrued.toCentavos()).toBe(0n);
  });
});
