// S6: a credit sale is a sale on its date; what the customer owes lives in this ledger. Balance =
// sum of the signed lines. A charge is positive, a payment (collection) and a reversal (void of
// the sale) are negative. Collections are never revenue. Pure rules, no IO.
import { Money } from '@mini-market/shared-kernel';

export type LedgerKind = 'charge' | 'payment' | 'reversal';
export type CollectionMethod = 'cash' | 'transfer' | 'qr' | 'card';

/** What a ledger line points at; a charge and its reversal point at the same sale. */
export interface LedgerReference {
  readonly type: string;
  readonly id: string;
}

/** One line of the credit ledger. Immutable: a correction is a new line (hard rule 3). */
export interface LedgerEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly kind: LedgerKind;
  /** Signed: positive for a charge, negative for a payment or a reversal. */
  readonly amount: Money;
  readonly reference: LedgerReference | null;
  /** Only on payments. */
  readonly paymentMethod: CollectionMethod | null;
  readonly occurredAt: Date;
  readonly createdBy: string;
}

/** A line of the statement: the entry and the balance right after it. */
export interface StatementLine {
  readonly entry: LedgerEntry;
  readonly balanceAfter: Money;
}

/** Sum of the signed lines: what the customer owes (negative when they overpaid). */
export function balanceOf(entries: readonly Pick<LedgerEntry, 'amount'>[]): Money {
  return entries.reduce((sum, entry) => sum.add(entry.amount), Money.zero());
}

/** The ledger in the order it was written, each line with the running balance. */
export function statementOf(entries: readonly LedgerEntry[]): readonly StatementLine[] {
  let running = Money.zero();
  return entries.map((entry) => {
    running = running.add(entry.amount);
    return { entry, balanceAfter: running };
  });
}

/** `null` limit means no limit; the balance after the charge may equal the limit. */
export function exceedsCreditLimit(
  balance: Money,
  charge: Money,
  creditLimitCentavos: bigint | null,
): boolean {
  if (creditLimitCentavos === null) return false;
  return balance.add(charge).toCentavos() > creditLimitCentavos;
}

/**
 * Moment of the oldest charge the payments have not covered yet. Payments settle the oldest
 * charges first; a charge that was reversed (its sale voided) is not owed and takes no payment.
 * `null` when every charge is covered.
 */
export function oldestUnpaidChargeAt(entries: readonly LedgerEntry[]): Date | null {
  const reversed = new Set(
    entries.flatMap((entry) =>
      entry.kind === 'reversal' && entry.reference ? [entry.reference.id] : [],
    ),
  );
  let paid = entries
    .filter((entry) => entry.kind === 'payment')
    .reduce((sum, entry) => sum - entry.amount.toCentavos(), 0n);
  const charges = entries
    .filter((entry) => entry.kind === 'charge')
    .filter((entry) => !(entry.reference && reversed.has(entry.reference.id)));
  for (const charge of charges) {
    const owed = charge.amount.toCentavos();
    if (paid < owed) return charge.occurredAt;
    paid -= owed;
  }
  return null;
}

const MS_PER_DAY = 86_400_000;

const utcOfDayKey = (dayKey: string): number => Date.parse(`${dayKey}T00:00:00Z`);

/**
 * Whole tenant days from one day key to another ("YYYY-MM-DD"), never negative. Both keys come
 * from `Period.dayKey` in the tenant timezone, so a late-evening charge counts as its local day.
 */
export function daysBetween(fromDayKey: string, toDayKey: string): number {
  const days = Math.round((utcOfDayKey(toDayKey) - utcOfDayKey(fromDayKey)) / MS_PER_DAY);
  return Math.max(0, days);
}
