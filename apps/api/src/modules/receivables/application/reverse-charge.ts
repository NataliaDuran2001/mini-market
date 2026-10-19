import { Money, err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { LedgerEntry, LedgerReference } from '../domain/credit-ledger';
import { ChargeAlreadyReversedError, ChargeNotFoundError } from '../domain/errors';
import type { CreditLedgerRepository } from './ports/credit-ledger.repository';
import type { CustomerRepository } from './ports/customer.repository';

export const REVERSE_CHARGE = Symbol('REVERSE_CHARGE');

/** Public API for the sales module: reverses the charge of a voided sale in its transaction (S12). */
export type ReverseCharge = (
  ctx: TenantContext,
  tx: Transaction,
  saleRef: LedgerReference,
) => Promise<Result<LedgerEntry, DomainError>>;

export interface ReverseChargeDeps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly clock: Clock;
}

/**
 * S12: appends a `reversal` that cancels the charge of the sale; the charge stays in the ledger.
 * The `credit_sales` flag is not checked: a tenant that switched the module off later must still
 * be able to void an old credit sale and get the balance back.
 */
export async function reverseCharge(
  deps: ReverseChargeDeps,
  ctx: TenantContext,
  tx: Transaction,
  saleRef: LedgerReference,
): Promise<Result<LedgerEntry, DomainError>> {
  const allowed = requirePermission(ctx, 'receivables.collect');
  if (!allowed.ok) return allowed;

  const charge = await deps.ledger.findByReference(tx, ctx.tenantId, 'charge', saleRef);
  if (!charge) return err(new ChargeNotFoundError('There is no charge for this sale'));
  // Same lock as a new charge, so the reversal and a concurrent charge see each other's balance.
  await deps.customers.lockById(tx, ctx.tenantId, charge.customerId);
  if (await deps.ledger.findByReference(tx, ctx.tenantId, 'reversal', saleRef)) {
    return err(new ChargeAlreadyReversedError('The charge of this sale was already reversed'));
  }

  return ok(
    await deps.ledger.append(tx, ctx.tenantId, {
      customerId: charge.customerId,
      kind: 'reversal',
      amount: Money.zero().subtract(charge.amount),
      reference: saleRef,
      paymentMethod: null,
      occurredAt: deps.clock.now(),
      createdBy: ctx.userId,
    }),
  );
}
