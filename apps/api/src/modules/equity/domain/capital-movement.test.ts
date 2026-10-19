import { Money } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CAPITAL_TOTALS,
  applyMovement,
  exceedsNetCapital,
  summarizeCapital,
} from './capital-movement';

const bs = (amount: number) => Money.fromCentavos(amount * 100);

describe('capital (S8)', () => {
  it('nets contributions against withdrawals', () => {
    // S8: 10,000 + 2,000 - 500 = 11,500
    let totals = EMPTY_CAPITAL_TOTALS;
    totals = applyMovement(totals, { kind: 'contribution', amount: bs(10_000) });
    totals = applyMovement(totals, { kind: 'contribution', amount: bs(2_000) });
    totals = applyMovement(totals, { kind: 'withdrawal', amount: bs(500) });
    const summary = summarizeCapital(totals);
    expect(summary.contributed.toCentavos()).toBe(1_200_000n);
    expect(summary.withdrawn.toCentavos()).toBe(50_000n);
    expect(summary.net.toCentavos()).toBe(1_150_000n);
  });

  it('starts at zero', () => {
    expect(summarizeCapital(EMPTY_CAPITAL_TOTALS).net.toCentavos()).toBe(0n);
  });

  it('flags only a withdrawal that leaves the net below zero', () => {
    const totals = applyMovement(EMPTY_CAPITAL_TOTALS, {
      kind: 'contribution',
      amount: bs(1_000),
    });
    expect(exceedsNetCapital(totals, { kind: 'withdrawal', amount: bs(1_000) })).toBe(false);
    expect(
      exceedsNetCapital(totals, { kind: 'withdrawal', amount: Money.fromCentavos(100_001) }),
    ).toBe(true);
    expect(exceedsNetCapital(totals, { kind: 'contribution', amount: bs(5_000) })).toBe(false);
  });

  it('keeps flagging a withdrawal once the capital is already negative', () => {
    const overdrawn = applyMovement(EMPTY_CAPITAL_TOTALS, { kind: 'withdrawal', amount: bs(10) });
    expect(exceedsNetCapital(overdrawn, { kind: 'withdrawal', amount: bs(1) })).toBe(true);
  });
});
