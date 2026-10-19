import { describe, expect, it } from 'vitest';
import { parseAmountToCentavos } from './amount';

describe('parseAmountToCentavos', () => {
  it.each([
    ['1500', 150000],
    ['1500.50', 150050],
    ['1500,50', 150050],
    [' 0.05 ', 5],
    ['19.99', 1999],
  ])('turns %s into %i centavos exactly', (input, centavos) => {
    expect(parseAmountToCentavos(input)).toEqual({ ok: true, centavos });
  });

  it.each(['', 'abc', '12.345', '1.500,50', '1e3'])('rejects %j as invalid', (input) => {
    expect(parseAmountToCentavos(input)).toEqual({
      ok: false,
      error: 'equity:validation.amountInvalid',
    });
  });

  it.each(['0', '0.00', '-5'])('rejects %s as not positive', (input) => {
    const result = parseAmountToCentavos(input);
    expect(result.ok).toBe(false);
  });

  it('rejects an amount that would not survive JSON as centavos', () => {
    expect(parseAmountToCentavos('100000000000000')).toEqual({
      ok: false,
      error: 'equity:validation.amountTooLarge',
    });
  });
});
