// Issue #81: integer moneySchema and the unchanged decimal-string quantitySchema.
import { describe, expect, it } from 'vitest';
import { moneySchema, quantitySchema } from '../src/common/index.js';

describe('moneySchema (#81)', () => {
  it('parses integer centavos and returns the same value', () => {
    // AC-1
    expect(moneySchema.parse(1050)).toBe(1050);
    expect(moneySchema.parse(0)).toBe(0);
    expect(moneySchema.parse(-250)).toBe(-250);
    expect(moneySchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    ['a decimal number', 10.5],
    ['a decimal string', '10.50'],
    ['an integer string', '1050'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['an integer above MAX_SAFE_INTEGER', Number('9007199254740993')],
    ['an integer below MIN_SAFE_INTEGER', -Number('9007199254740993')],
    ['null', null],
    ['a bigint', 1050n],
  ])('rejects %s', (_label, value) => {
    // AC-1
    expect(moneySchema.safeParse(value).success).toBe(false);
  });
});

describe('quantitySchema stays a decimal string (#81)', () => {
  it('parses decimal strings with up to 3 decimals', () => {
    // AC-2
    expect(quantitySchema.parse('1.250')).toBe('1.250');
    expect(quantitySchema.parse('0.333')).toBe('0.333');
  });

  it('rejects a fourth decimal and a JSON number', () => {
    // AC-2
    expect(quantitySchema.safeParse('1.2345').success).toBe(false);
    expect(quantitySchema.safeParse(1.25).success).toBe(false);
    expect(quantitySchema.safeParse(1).success).toBe(false);
  });
});
