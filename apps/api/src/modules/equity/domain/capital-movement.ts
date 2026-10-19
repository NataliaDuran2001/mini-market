// S8: capital = sum(contributions) - sum(withdrawals). Capital movements never affect gross or net
// profit; only the owner records or sees them.
import { Money } from '@mini-market/shared-kernel';

export type CapitalMovementKind = 'contribution' | 'withdrawal';

/** One line of the capital ledger. Immutable: a correction is a new movement. */
export interface CapitalMovement {
  readonly id: string;
  readonly tenantId: string;
  readonly kind: CapitalMovementKind;
  /** Always positive; the kind decides the direction. */
  readonly amount: Money;
  readonly occurredAt: Date;
  readonly note: string | null;
  readonly createdBy: string;
}

/** Sums of the ledger by kind, as the repository reads them. */
export interface CapitalTotals {
  readonly contributed: Money;
  readonly withdrawn: Money;
}

export interface CapitalSummary extends CapitalTotals {
  /** `contributed - withdrawn`; negative when the owner took out more than they put in. */
  readonly net: Money;
}

export const EMPTY_CAPITAL_TOTALS: CapitalTotals = {
  contributed: Money.zero(),
  withdrawn: Money.zero(),
};

/** S8: net capital of a set of totals. */
export function summarizeCapital(totals: CapitalTotals): CapitalSummary {
  return { ...totals, net: totals.contributed.subtract(totals.withdrawn) };
}

/** The totals after recording one more movement. */
export function applyMovement(
  totals: CapitalTotals,
  movement: Pick<CapitalMovement, 'kind' | 'amount'>,
): CapitalTotals {
  return movement.kind === 'contribution'
    ? { ...totals, contributed: totals.contributed.add(movement.amount) }
    : { ...totals, withdrawn: totals.withdrawn.add(movement.amount) };
}

/**
 * True when a withdrawal leaves the net capital below zero. It is allowed (the owner decides) but
 * the API answers with a warning so the screen can say so.
 */
export function exceedsNetCapital(
  totalsBefore: CapitalTotals,
  movement: Pick<CapitalMovement, 'kind' | 'amount'>,
): boolean {
  if (movement.kind !== 'withdrawal') return false;
  return summarizeCapital(applyMovement(totalsBefore, movement)).net.isNegative();
}
