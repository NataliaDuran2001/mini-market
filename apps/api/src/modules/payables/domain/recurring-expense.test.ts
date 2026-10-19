import { Period } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import { checkSchedule, comparePeriods, dueDateFor, generatesFor } from './recurring-expense';

const p = (year: number, month: number) => Period.of(year, month);

describe('recurring expense generation rule (S5)', () => {
  const template = { active: true, startsPeriod: p(2026, 10), endsPeriod: null };

  it('generates from its first period on', () => {
    // AC-1
    expect(generatesFor(template, p(2026, 9))).toBe(false);
    expect(generatesFor(template, p(2026, 10))).toBe(true);
    expect(generatesFor(template, p(2027, 3))).toBe(true);
  });

  it('stops after its last period', () => {
    const ending = { ...template, endsPeriod: p(2026, 12) };
    expect(generatesFor(ending, p(2026, 12))).toBe(true);
    expect(generatesFor(ending, p(2027, 1))).toBe(false);
  });

  it('does not generate while inactive', () => {
    expect(generatesFor({ ...template, active: false }, p(2026, 11))).toBe(false);
  });

  it('compares periods across a year boundary', () => {
    expect(comparePeriods(p(2026, 12), p(2027, 1))).toBeLessThan(0);
    expect(comparePeriods(p(2027, 1), p(2027, 1))).toBe(0);
  });
});

describe('due date inside a period', () => {
  it('puts the due day inside the period, not in the month of payment', () => {
    // AC-1
    expect(dueDateFor(p(2026, 11), 5)).toBe('2026-11-05');
  });

  it('uses the last day of a shorter month', () => {
    expect(dueDateFor(p(2026, 2), 31)).toBe('2026-02-28');
    expect(dueDateFor(p(2028, 2), 30)).toBe('2028-02-29');
    expect(dueDateFor(p(2026, 4), 31)).toBe('2026-04-30');
  });
});

describe('schedule check', () => {
  it('accepts an open end and an end on or after the start', () => {
    expect(checkSchedule(p(2026, 10), null).ok).toBe(true);
    expect(checkSchedule(p(2026, 10), p(2026, 10)).ok).toBe(true);
  });

  it('rejects an end before the start', () => {
    const result = checkSchedule(p(2026, 10), p(2026, 9));
    expect(!result.ok && result.error.code).toBe('INVALID_SCHEDULE');
  });
});
