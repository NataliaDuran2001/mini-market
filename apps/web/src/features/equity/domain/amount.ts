import { Money } from '@mini-market/shared-kernel';

export type AmountError =
  | 'equity:validation.amountInvalid'
  | 'equity:validation.amountPositive'
  | 'equity:validation.amountTooLarge';

export type ParsedAmount =
  | { readonly ok: true; readonly centavos: number }
  | { readonly ok: false; readonly error: AmountError };

/**
 * Bs typed by the person ("1500", "1500.50" or "1500,50") to whole centavos for the API. Parsing
 * goes through `Money`, never through float arithmetic (hard rule 2).
 */
export function parseAmountToCentavos(input: string): ParsedAmount {
  const parsed = Money.fromDecimalString(input.trim().replace(',', '.'));
  if (!parsed.ok) return { ok: false, error: 'equity:validation.amountInvalid' };
  const centavos = parsed.value.toCentavos();
  if (centavos <= 0n) return { ok: false, error: 'equity:validation.amountPositive' };
  if (centavos > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, error: 'equity:validation.amountTooLarge' };
  }
  return { ok: true, centavos: Number(centavos) };
}
