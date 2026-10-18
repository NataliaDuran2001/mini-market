import { describe, expect, it } from 'vitest';
import { Quantity, ValidationError } from '../src/index.js';

const q = (text: string): Quantity => Quantity.parse(text);

describe('Quantity', () => {
  it.each([
    ['0.333', 333n],
    ['10', 10000n],
    ['10.5', 10500n],
    ['-2.250', -2250n],
    ['0', 0n],
  ])('parses %s as %s thousandths', (text, thousandths) => {
    expect(q(text).toThousandths()).toBe(thousandths);
  });

  it.each([
    [333n, '0.333'],
    [10000n, '10.000'],
    [-2250n, '-2.250'],
    [0n, '0.000'],
    [5n, '0.005'],
  ])('formats %s thousandths as %s (numeric(14,3) text)', (thousandths, text) => {
    expect(Quantity.fromThousandths(thousandths).toString()).toBe(text);
  });

  it.each(['0.3333', 'x', '', '1e3', '.5', '1,5'])(
    'rejects %j with a Validation error',
    (input) => {
      const result = Quantity.tryParse(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(() => Quantity.parse(input)).toThrow(ValidationError);
    },
  );

  it('rejects values numeric(14,3) cannot hold and keeps the widest valid one', () => {
    expect(q('99999999999.999').toThousandths()).toBe(99999999999999n);
    expect(q('-99999999999.999').toThousandths()).toBe(-99999999999999n);
    expect(Quantity.tryParse('100000000000.000').ok).toBe(false);
    expect(Quantity.tryParse('-100000000000.000').ok).toBe(false);
  });

  it('never echoes more than 32 characters of bad input in the error details', () => {
    const result = Quantity.tryParse('x'.repeat(1000));
    expect(!result.ok && result.error.details).toEqual({ input: `${'x'.repeat(32)}...` });
  });

  it('adds and subtracts exactly', () => {
    expect(q('0.1').add(q('0.2')).toString()).toBe('0.300');
    expect(q('1').subtract(q('1.5')).toString()).toBe('-0.500');
  });

  it('multiplies by an integer factor (S11 presentation to base unit)', () => {
    expect(q('2.5').multiplyFactor(12).toString()).toBe('30.000');
    expect(q('0.001').multiplyFactor(10n).toString()).toBe('0.010');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the factor %s', (factor) => {
    expect(() => q('1').multiplyFactor(factor)).toThrow(RangeError);
  });

  it('compares and reports its sign', () => {
    expect(q('1').compare(q('2'))).toBe(-1);
    expect(q('2').compare(q('1'))).toBe(1);
    expect(q('2').compare(q('2.000'))).toBe(0);
    expect(q('2').equals(q('2.000'))).toBe(true);
    expect(q('2').equals(q('3'))).toBe(false);
    expect(q('0.001').isPositive()).toBe(true);
    expect(Quantity.zero().isPositive()).toBe(false);
    expect(q('-0.001').isPositive()).toBe(false);
    expect(q('-0.001').isNegative()).toBe(true);
    expect(Quantity.zero().isNegative()).toBe(false);
  });

  it('accepts bigint and safe integer thousandths only', () => {
    expect(Quantity.fromThousandths(1500).toString()).toBe('1.500');
    expect(() => Quantity.fromThousandths(0.5)).toThrow(RangeError);
  });

  it('is immutable', () => {
    const quantity = q('1');
    expect(Object.isFrozen(quantity)).toBe(true);
    quantity.add(q('1'));
    expect(quantity.toString()).toBe('1.000');
  });
});
