import { Money } from '@mini-market/shared-kernel';
import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
  it('formats centavos as Bolivianos with es-BO separators', () => {
    // AC-3
    expect(formatMoney(Money.fromCentavos(123456))).toBe('Bs 1.234,56');
  });

  it('always shows two decimals and groups thousands', () => {
    // AC-3
    expect(formatMoney(Money.zero())).toBe('Bs 0,00');
    expect(formatMoney(Money.fromCentavos(5))).toBe('Bs 0,05');
    expect(formatMoney(Money.fromCentavos(100000000))).toBe('Bs 1.000.000,00');
  });

  it('formats negative amounts', () => {
    // AC-3
    expect(formatMoney(Money.fromCentavos(-123450))).toBe('-Bs 1.234,50');
  });

  it('uses a plain space, not a no-break space', () => {
    // AC-3
    expect(formatMoney(Money.fromCentavos(100))).not.toContain(String.fromCharCode(0xa0));
  });
});
