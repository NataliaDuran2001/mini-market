import { describe, expect, it } from 'vitest';
import { Money, Quantity, WeightedAverage } from '../src/index.js';

const next = (prevQty: string, prevAvg: number, inQty: string, inCost: number): bigint =>
  WeightedAverage.next(
    Quantity.parse(prevQty),
    Money.fromCentavos(prevAvg),
    Quantity.parse(inQty),
    Money.fromCentavos(inCost),
  ).toCentavos();

describe('WeightedAverage.next (S3)', () => {
  it('recalculates the average on a purchase: 10 at 5.00 plus 5 at 8.00 is 6.00', () => {
    // AC-2
    const result = WeightedAverage.next(
      Quantity.parse('10'),
      Money.fromCentavos(500),
      Quantity.parse('5'),
      Money.fromCentavos(800),
    );
    expect(result.equals(Money.fromCentavos(600))).toBe(true);
  });

  it('matches the worked example of docs/01-domain.md: 10 at 5.00 plus 20 at 6.50 is 6.00', () => {
    // AC-2
    expect(next('10', 500, '20', 650)).toBe(600n);
  });

  it('rounds HALF_UP to the centavo, once', () => {
    // AC-2
    expect(next('1', 100, '2', 101)).toBe(101n); // 302 / 3 = 100.67
    expect(next('1', 100, '1', 101)).toBe(101n); // 100.5 is a tie, goes up
    expect(next('2', 100, '1', 101)).toBe(100n); // 100.33
  });

  it('handles fractional quantities exactly', () => {
    // AC-2
    expect(next('0.500', 1000, '0.500', 2000)).toBe(1500n);
  });

  it.each(['0', '-3'])('uses the purchase cost when the current quantity is %s', (prevQty) => {
    // AC-2
    expect(next(prevQty, 999, '4', 650)).toBe(650n);
  });

  it('keeps the average when the purchase cost equals it', () => {
    // AC-2
    expect(next('7.250', 480, '3.125', 480)).toBe(480n);
  });

  it.each(['0', '-1'])('rejects a purchased quantity of %s as a caller bug', (inQty) => {
    expect(() => next('10', 500, inQty, 800)).toThrow(RangeError);
  });
});
