import { describe, expect, it } from 'vitest';
import { divideRounded } from '../src/rounding.js';

describe('divideRounded', () => {
  it.each([
    [7n, 2n, 'HALF_UP', 4n], // 3.5 tie goes up
    [-7n, 2n, 'HALF_UP', -4n], // -3.5 tie goes away from zero
    [5n, 3n, 'HALF_UP', 2n], // 1.67
    [4n, 3n, 'HALF_UP', 1n], // 1.33
    [-5n, 3n, 'HALF_UP', -2n],
    [-4n, 3n, 'HALF_UP', -1n],
    [6n, 3n, 'HALF_UP', 2n], // exact
    [7n, 2n, 'DOWN', 3n],
    [-7n, 2n, 'DOWN', -3n],
  ] as const)('%s / %s with %s is %s', (numerator, denominator, mode, expected) => {
    expect(divideRounded(numerator, denominator, mode)).toBe(expected);
  });

  it('rejects a denominator that is not positive', () => {
    expect(() => divideRounded(1n, 0n)).toThrow(RangeError);
    expect(() => divideRounded(1n, -2n)).toThrow(RangeError);
  });
});
