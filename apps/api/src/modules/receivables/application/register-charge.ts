import { err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Money, Result } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import type { TenantContext } from '../../access';
import { exceedsCreditLimit } from '../domain/credit-ledger';
import type { LedgerEntry, LedgerReference } from '../domain/credit-ledger';
import {
  ChargeAlreadyRegisteredError,
  CreditLimitExceededError,
  CustomerInactiveError,
  CustomerNotFoundError,
} from '../domain/errors';
import { authorize } from './authorize';
import type { CreditLedgerRepository } from './ports/credit-ledger.repository';
import type { CustomerRepository } from './ports/customer.repository';

export const REGISTER_CHARGE = Symbol('REGISTER_CHARGE');

/**
 * Public API for the sales module: charges a credit sale to a customer inside the transaction of
 * the sale (docs/02 section 7), so the sale, the stock and the debt commit together.
 */
export type RegisterCharge = (
  ctx: TenantContext,
  tx: Transaction,
  customerId: string,
  amount: Money,
  saleRef: LedgerReference,
) => Promise<Result<LedgerEntry, DomainError>>;

export interface RegisterChargeDeps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly clock: Clock;
}

/**
 * S6: appends a `charge` to the ledger. Refused when the customer is unknown or inactive, when
 * the sale was already charged, or when the new balance would pass the credit limit. The customer
 * row stays locked until the transaction ends, so two charges cannot both fit under the limit.
 */
export async function registerCharge(
  deps: RegisterChargeDeps,
  ctx: TenantContext,
  tx: Transaction,
  customerId: string,
  amount: Money,
  saleRef: LedgerReference,
): Promise<Result<LedgerEntry, DomainError>> {
  const allowed = authorize(ctx, 'receivables.collect');
  if (!allowed.ok) return allowed;
  if (amount.toCentavos() <= 0n) {
    return err(new ValidationError('The amount of a charge must be greater than zero'));
  }

  const customer = await deps.customers.lockById(tx, ctx.tenantId, customerId);
  if (!customer) return err(new CustomerNotFoundError('Customer not found'));
  if (!customer.active) return err(new CustomerInactiveError('The customer is inactive'));
  if (await deps.ledger.findByReference(tx, ctx.tenantId, 'charge', saleRef)) {
    return err(new ChargeAlreadyRegisteredError('This sale was already charged'));
  }

  const balance = await deps.ledger.balanceOf(tx, ctx.tenantId, customerId);
  if (exceedsCreditLimit(balance, amount, customer.creditLimitCentavos)) {
    return err(
      new CreditLimitExceededError('The charge exceeds the credit limit of the customer', {
        balanceCentavos: Number(balance.toCentavos()),
        chargeCentavos: Number(amount.toCentavos()),
        creditLimitCentavos: Number(customer.creditLimitCentavos),
      }),
    );
  }

  return ok(
    await deps.ledger.append(tx, ctx.tenantId, {
      customerId,
      kind: 'charge',
      amount,
      reference: saleRef,
      paymentMethod: null,
      occurredAt: deps.clock.now(),
      createdBy: ctx.userId,
    }),
  );
}
