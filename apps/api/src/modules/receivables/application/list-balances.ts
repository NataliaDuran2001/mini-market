import { Money, Period, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { TenantContext } from '../../access';
import { daysBetween, oldestUnpaidChargeAt } from '../domain/credit-ledger';
import type { Customer } from '../domain/customer';
import { authorize } from './authorize';
import type { CreditLedgerRepository } from './ports/credit-ledger.repository';
import type { CustomerRepository } from './ports/customer.repository';

export const LIST_BALANCES = Symbol('LIST_BALANCES');

export interface ReceivableRow {
  readonly customer: Customer;
  readonly balance: Money;
  /** Tenant days since the oldest charge payments have not covered; null when nothing is owed. */
  readonly overdueDays: number | null;
}

export interface ReceivablesView {
  readonly items: readonly ReceivableRow[];
  /** What customers owe the business in total (S6, informational), whatever the filter. */
  readonly totalPending: Money;
}

export interface ReceivablesFilter {
  readonly q?: string | undefined;
  /** Only customers that owe something. */
  readonly withBalance?: boolean | undefined;
}

export type ListBalances = (
  ctx: TenantContext,
  filter: ReceivablesFilter,
) => Promise<Result<ReceivablesView, DomainError>>;

export interface ListBalancesDeps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

const isOwed = (balance: Money): boolean => balance.toCentavos() > 0n;

/**
 * S6: who owes what, biggest debt first (ties by name), with how long the oldest unpaid charge
 * has waited. Owner and employee.
 */
export async function listBalances(
  deps: ListBalancesDeps,
  ctx: TenantContext,
  filter: ReceivablesFilter,
): Promise<Result<ReceivablesView, DomainError>> {
  const allowed = authorize(ctx, 'receivables.read');
  if (!allowed.ok) return allowed;

  const today = Period.dayKey(deps.clock.now(), ctx.settings.timezone);
  return ok(
    await deps.withTransaction(ctx, async (tx) => {
      const customers = await deps.customers.list(tx, ctx.tenantId, { q: filter.q });
      const balances = await deps.ledger.balances(tx, ctx.tenantId);
      const balanceFor = (customer: Customer): Money => balances.get(customer.id) ?? Money.zero();
      const listed = customers.filter((customer) => !filter.withBalance || isOwed(balanceFor(customer)));
      const owing = listed.filter((customer) => isOwed(balanceFor(customer)));
      const entries = await deps.ledger.entriesOfCustomers(
        tx,
        ctx.tenantId,
        owing.map((customer) => customer.id),
      );

      const items = listed
        .map((customer): ReceivableRow => {
          const balance = balanceFor(customer);
          const since = isOwed(balance)
            ? oldestUnpaidChargeAt(entries.filter((entry) => entry.customerId === customer.id))
            : null;
          const overdueDays =
            since === null ? null : daysBetween(Period.dayKey(since, ctx.settings.timezone), today);
          return { customer, balance, overdueDays };
        })
        .sort((a, b) => b.balance.compare(a.balance));
      const totalPending = [...balances.values()]
        .filter(isOwed)
        .reduce((sum, balance) => sum.add(balance), Money.zero());
      return { items, totalPending };
    }),
  );
}
