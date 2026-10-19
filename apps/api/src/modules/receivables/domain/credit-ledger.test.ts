import { Money } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  daysBetween,
  exceedsCreditLimit,
  oldestUnpaidChargeAt,
  statementOf,
} from './credit-ledger';
import type { LedgerEntry, LedgerKind } from './credit-ledger';

const bs = (amount: number): Money => Money.fromCentavos(amount * 100);

let sequence = 0;
function entry(
  kind: LedgerKind,
  amountBs: number,
  day: string,
  referenceId: string | null = null,
): LedgerEntry {
  sequence += 1;
  return {
    id: `entry-${sequence}`,
    tenantId: 't',
    customerId: 'c',
    kind,
    amount: bs(amountBs),
    reference: referenceId ? { type: 'sale', id: referenceId } : null,
    paymentMethod: kind === 'payment' ? 'cash' : null,
    occurredAt: new Date(`${day}T12:00:00Z`),
    createdBy: 'u',
  };
}

describe('credit ledger rules (S6)', () => {
  it('sums charges up and payments and reversals down', () => {
    const entries = [
      entry('charge', 50, '2026-10-01', 's1'),
      entry('charge', 30, '2026-10-02', 's2'),
      entry('payment', -20, '2026-10-03'),
      entry('reversal', -30, '2026-10-04', 's2'),
    ];

    expect(balanceOf(entries).toCentavos()).toBe(3_000n);
    expect(balanceOf([]).toCentavos()).toBe(0n);
  });

  it('gives each statement line the balance right after it', () => {
    const lines = statementOf([
      entry('charge', 50, '2026-10-01', 's1'),
      entry('charge', 30, '2026-10-02', 's2'),
      entry('payment', -20, '2026-10-03'),
    ]);

    expect(lines.map((line) => line.balanceAfter.toCentavos())).toEqual([5_000n, 8_000n, 6_000n]);
  });

  it.each([
    [90, 20, 100, true],
    [90, 10, 100, false],
    [90, 20, null, false],
    [0, 1, 0, true],
  ])(
    'balance %i plus charge %i against limit %s exceeds: %s',
    (balance, charge, limit, expected) => {
      const limitCentavos = limit === null ? null : BigInt(limit * 100);

      expect(exceedsCreditLimit(bs(balance), bs(charge), limitCentavos)).toBe(expected);
    },
  );

  describe('oldestUnpaidChargeAt', () => {
    it('is the first charge when nothing was paid', () => {
      const first = entry('charge', 50, '2026-10-01', 's1');

      expect(oldestUnpaidChargeAt([first, entry('charge', 30, '2026-10-05', 's2')])).toEqual(
        first.occurredAt,
      );
    });

    it('moves to the next charge once payments cover the oldest ones', () => {
      const second = entry('charge', 30, '2026-10-05', 's2');
      const entries = [
        entry('charge', 50, '2026-10-01', 's1'),
        second,
        entry('payment', -50, '2026-10-06'),
      ];

      expect(oldestUnpaidChargeAt(entries)).toEqual(second.occurredAt);
    });

    it('keeps a partly paid charge as the oldest unpaid one', () => {
      const first = entry('charge', 50, '2026-10-01', 's1');

      expect(oldestUnpaidChargeAt([first, entry('payment', -20, '2026-10-02')])).toEqual(
        first.occurredAt,
      );
    });

    it('skips a reversed charge and is null when everything is covered', () => {
      const entries = [
        entry('charge', 50, '2026-10-01', 's1'),
        entry('reversal', -50, '2026-10-02', 's1'),
        entry('charge', 30, '2026-10-03', 's2'),
        entry('payment', -30, '2026-10-04'),
      ];

      expect(oldestUnpaidChargeAt(entries)).toBeNull();
    });
  });

  it('counts whole days between day keys and never goes negative', () => {
    expect(daysBetween('2026-10-01', '2026-10-15')).toBe(14);
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(daysBetween('2026-10-16', '2026-10-15')).toBe(0);
  });
});
