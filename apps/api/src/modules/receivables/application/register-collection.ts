import type { RegisterCollectionRequest } from '@mini-market/contracts/receivables';
import { Money, err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { AuditPort, TenantContext } from '../../access';
import type { LedgerEntry } from '../domain/credit-ledger';
import { CollectionExceedsBalanceError, CustomerNotFoundError } from '../domain/errors';
import { authorize } from './authorize';
import { occurredAtOf } from './occurred-at';
import type { CreditLedgerRepository } from './ports/credit-ledger.repository';
import type { CustomerRepository } from './ports/customer.repository';

export const REGISTER_COLLECTION = Symbol('REGISTER_COLLECTION');

export interface RegisteredCollection {
  readonly entry: LedgerEntry;
  /** What the customer owes after this collection. */
  readonly balance: Money;
}

export type RegisterCollection = (
  ctx: TenantContext,
  customerId: string,
  input: RegisterCollectionRequest,
) => Promise<Result<RegisteredCollection, DomainError>>;

export interface RegisterCollectionDeps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * S6: a collection (cobro) is money in against the balance, a negative `payment` line; it is not
 * revenue. Employees collect (`receivables.collect`). It cannot exceed what the customer owes, so
 * a balance never turns negative, and it works for an inactive customer who still owes.
 */
export async function registerCollection(
  deps: RegisterCollectionDeps,
  ctx: TenantContext,
  customerId: string,
  input: RegisterCollectionRequest,
): Promise<Result<RegisteredCollection, DomainError>> {
  const allowed = authorize(ctx, 'receivables.collect');
  if (!allowed.ok) return allowed;

  const now = deps.clock.now();
  const occurredAt = occurredAtOf(input.occurredOn, now, ctx.settings.timezone);
  if (!occurredAt.ok) return occurredAt;
  const amount = Money.fromCentavos(input.amountCentavos);

  return deps.withTransaction(ctx, async (tx): Promise<Result<RegisteredCollection, DomainError>> => {
    if (!(await deps.customers.lockById(tx, ctx.tenantId, customerId))) {
      return err(new CustomerNotFoundError('Customer not found'));
    }
    const balance = await deps.ledger.balanceOf(tx, ctx.tenantId, customerId);
    if (amount.compare(balance) > 0) {
      return err(
        new CollectionExceedsBalanceError('The collection is larger than what the customer owes', {
          balanceCentavos: Number(balance.toCentavos()),
        }),
      );
    }
    const entry = await deps.ledger.append(tx, ctx.tenantId, {
      customerId,
      kind: 'payment',
      amount: Money.zero().subtract(amount),
      reference: null,
      paymentMethod: input.method,
      occurredAt: occurredAt.value,
      createdBy: ctx.userId,
    });
    await deps.audit.record(tx, {
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      action: 'collection.recorded',
      entity: 'customer',
      entityId: customerId,
      after: { ledgerEntryId: entry.id, amountCentavos: input.amountCentavos, method: input.method },
      at: now,
    });
    return ok({ entry, balance: balance.subtract(amount) });
  });
}
