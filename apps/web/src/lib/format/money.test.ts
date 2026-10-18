import { describe, expect, it } from 'vitest';
import { formatMoney, type MoneyLike } from './money';

// TODO(#5): once @mini-market/shared-kernel exports Money, build these with
// Money.fromCentavos(...) instead of this stand-in (same toDecimalString contract).
function bs(centavos: number): MoneyLike {
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const decimals = String(abs % 100).padStart(2, '0');
  return { toDecimalString: () => `${sign}${Math.trunc(abs / 100)}.${decimals}` };
}

describe('formatMoney', () => {
  it('formats centavos as Bolivianos with es-BO separators', () => {
    // AC-3: 123456 centavos
    expect(formatMoney(bs(123456))).toBe('Bs 1.234,56');
  });

  it('always shows two decimals and groups thousands', () => {
    expect(formatMoney(bs(0))).toBe('Bs 0,00');
    expect(formatMoney(bs(5))).toBe('Bs 0,05');
    expect(formatMoney(bs(100000000))).toBe('Bs 1.000.000,00');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(bs(-123450))).toBe('-Bs 1.234,50');
  });

  it('uses a plain space, not a no-break space', () => {
    expect(formatMoney(bs(100))).not.toContain(String.fromCharCode(0xa0));
  });
});
