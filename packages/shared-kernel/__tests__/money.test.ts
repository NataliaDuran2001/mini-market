import { describe, expect, it } from 'vitest';
import { Money, Quantity, ValidationError } from '../src/index.js';

const c = (value: number | bigint): Money => Money.fromCentavos(value);

describe('Money', () => {
  it('multiplies by a quantity and rounds HALF_UP to the centavo', () => {
    // AC-1
    const result = Money.fromCentavos(1000).multiplyByQuantity(Quantity.parse('0.333'));
    expect(result.equals(Money.fromCentavos(333))).toBe(true);
    expect(result.toCentavos()).toBe(333n);
  });

  it.each([
    // [centavos, quantity, expected centavos, mode]
    [5, '0.5', 3, 'HALF_UP'], // 2.5 -> 3 (tie goes up)
    [5, '0.499', 2, 'HALF_UP'], // 2.495 -> 2
    [-5, '0.5', -3, 'HALF_UP'], // ties round away from zero
    [-5, '0.499', -2, 'HALF_UP'],
    [5, '0.5', 2, 'DOWN'], // truncates
    [-5, '0.5', -2, 'DOWN'],
    [1999, '2.000', 3998, 'HALF_UP'], // exact product, nothing to round
    [0, '12.345', 0, 'HALF_UP'],
  ] as const)(
    'multiplies %i centavos by %s giving %i (%s)',
    (centavos, quantity, expected, mode) => {
      // AC-1
      const result = c(centavos).multiplyByQuantity(Quantity.parse(quantity), mode);
      expect(result.toCentavos()).toBe(BigInt(expected));
    },
  );

  it('defaults to HALF_UP when no rounding mode is given', () => {
    // AC-1
    expect(c(5).multiplyByQuantity(Quantity.parse('0.5')).toCentavos()).toBe(3n);
  });

  it('rejects a decimal string with more than 2 decimals with a Validation error', () => {
    // AC-4
    const result = Money.fromDecimalString('12.345');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(result.error.details).toEqual({ input: '12.345' });
  });

  it('rejects amounts a bigint centavos column cannot hold, and keeps the largest', () => {
    // AC-4
    const max = Money.fromDecimalString('92233720368547758.07');
    expect(max.ok && max.value.toCentavos()).toBe(9223372036854775807n);
    expect(Money.fromDecimalString('92233720368547758.08').ok).toBe(false);
    expect(Money.fromDecimalString('-92233720368547758.08').ok).toBe(false);
  });

  it('never echoes more than 32 characters of bad input in the error details', () => {
    // AC-4
    const result = Money.fromDecimalString('x'.repeat(1000));
    expect(!result.ok && result.error.details).toEqual({ input: `${'x'.repeat(32)}...` });
  });

  it.each(['', ' ', 'abc', '1e3', '.5', '5.', '1,50', '--1', '+1', '1 .5', '0x10', '1.2.3'])(
    'rejects the malformed decimal string %j',
    (input) => {
      // AC-4
      expect(Money.fromDecimalString(input).ok).toBe(false);
    },
  );

  it('rejects absurdly long input before converting it', () => {
    // AC-4
    expect(Money.fromDecimalString('1'.repeat(40)).ok).toBe(false);
  });

  it.each([
    ['12.50', 1250n],
    ['12.5', 1250n],
    ['12', 1200n],
    ['0.05', 5n],
    ['-0.05', -5n],
    ['-0', 0n],
    ['007.10', 710n],
    ['9007199254740993.00', 900719925474099300n], // beyond Number.MAX_SAFE_INTEGER, still exact
  ])('parses %s as %s centavos', (input, centavos) => {
    const result = Money.fromDecimalString(input);
    expect(result.ok && result.value.toCentavos()).toBe(centavos);
  });

  it.each([
    [1250n, '12.50'],
    [5n, '0.05'],
    [-5n, '-0.05'],
    [0n, '0.00'],
    [100n, '1.00'],
    [123456789n, '1234567.89'],
  ])('formats %s centavos as %s', (centavos, text) => {
    expect(c(centavos).toDecimalString()).toBe(text);
  });

  it('round-trips through its decimal string', () => {
    for (const centavos of [0n, 1n, 99n, 100n, 101n, -1n, -100n, 999999999999n]) {
      const parsed = Money.fromDecimalString(c(centavos).toDecimalString());
      expect(parsed.ok && parsed.value.toCentavos()).toBe(centavos);
    }
  });

  it('adds and subtracts exactly where floating point would drift', () => {
    expect(c(10).add(c(20)).toCentavos()).toBe(30n);
    expect(c(10).subtract(c(30)).toCentavos()).toBe(-20n);
    // 0.1 + 0.2 !== 0.3 for numbers; for Money it is exact
    const sum = Money.fromDecimalString('0.10');
    const other = Money.fromDecimalString('0.20');
    expect(sum.ok && other.ok && sum.value.add(other.value).toDecimalString()).toBe('0.30');
  });

  it('compares, detects equality and sign', () => {
    expect(c(1).compare(c(2))).toBe(-1);
    expect(c(2).compare(c(1))).toBe(1);
    expect(c(2).compare(c(2))).toBe(0);
    expect(c(2).equals(c(2))).toBe(true);
    expect(c(2).equals(c(3))).toBe(false);
    expect(c(-1).isNegative()).toBe(true);
    expect(c(0).isNegative()).toBe(false);
    expect(Money.zero().toCentavos()).toBe(0n);
    expect(Money.zero().currency).toBe('BOB');
  });

  it('accepts bigint and safe integer centavos only', () => {
    expect(c(5n).toCentavos()).toBe(5n);
    expect(() => c(1.5)).toThrow(RangeError);
    expect(() => c(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => c(Number.NaN)).toThrow(RangeError);
  });

  it('is immutable', () => {
    const money = c(5);
    expect(Object.isFrozen(money)).toBe(true);
    money.add(c(1));
    expect(money.toCentavos()).toBe(5n);
  });

  it('refuses accidental JSON serialization so contracts must map it explicitly', () => {
    expect(() => JSON.stringify({ total: c(5) })).toThrow(TypeError);
  });

  describe('allocate', () => {
    const sum = (parts: readonly Money[]): bigint =>
      parts.reduce((total, part) => total + part.toCentavos(), 0n);

    it('splits without losing a centavo', () => {
      const parts = c(100).allocate([1, 1, 1]);
      expect(parts.map((part) => part.toCentavos())).toEqual([34n, 33n, 33n]);
      expect(sum(parts)).toBe(100n);
    });

    it('splits by proportion', () => {
      expect(
        c(1000)
          .allocate([70, 30])
          .map((part) => part.toCentavos()),
      ).toEqual([700n, 300n]);
    });

    it('gives leftovers only to non-zero ratios', () => {
      const parts = c(5).allocate([0, 1, 1]);
      expect(parts.map((part) => part.toCentavos())).toEqual([0n, 3n, 2n]);
    });

    it('keeps the sign of negative amounts and still adds up', () => {
      const parts = c(-100).allocate([1, 1, 1]);
      expect(parts.map((part) => part.toCentavos())).toEqual([-34n, -33n, -33n]);
      expect(sum(parts)).toBe(-100n);
    });

    it('conserves the total for many amounts and ratio sets (property)', () => {
      const ratioSets = [[1], [1, 2, 3], [7, 0, 13, 1], [1, 1, 1, 1, 1, 1, 1], [99, 1]];
      for (let amount = -250; amount <= 250; amount += 7) {
        for (const ratios of ratioSets) {
          const parts = c(amount).allocate(ratios);
          expect(parts).toHaveLength(ratios.length);
          expect(sum(parts)).toBe(BigInt(amount));
        }
      }
    });

    it.each([[[]], [[0, 0]], [[-1, 2]], [[1.5, 1]]] as const)(
      'rejects invalid ratios %j',
      (ratios) => {
        expect(() => c(100).allocate(ratios)).toThrow(RangeError);
      },
    );
  });
});
