import type { Money } from '@mini-market/shared-kernel';

const DEFAULT_LOCALE = 'es-BO';
// Intl puts a no-break space (U+00A0) between "Bs" and the amount; the UI contract is a plain space.
const NO_BREAK_SPACE = new RegExp(String.fromCharCode(0xa0), 'g');

/**
 * Renders money for the UI, e.g. `Bs 1.234,56`. The exact decimal string of `Money` goes straight
 * to Intl (no float), so centavos are never formatted by hand (docs/04-coding-standards.md).
 */
export function formatMoney(money: Money, locale: string = DEFAULT_LOCALE): string {
  return (
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'BOB', useGrouping: 'always' })
      // as: Money guarantees a plain decimal string such as "1234.56", which Intl accepts exactly.
      .format(money.toDecimalString() as `${number}`)
      .replace(NO_BREAK_SPACE, ' ')
  );
}
