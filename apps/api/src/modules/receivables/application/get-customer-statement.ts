import { err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Money, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { TenantContext } from '../../access';
import { balanceOf, statementOf } from '../domain/credit-ledger';
import type { StatementLine } from '../domain/credit-ledger';
import type { Customer } from '../domain/customer';
import { CustomerNotFoundError } from '../domain/errors';
import { authorize } from './authorize';
import type { CreditLedgerRepository } from './ports/credit-ledger.repository';
import type { CustomerRepository } from './ports/customer.repository';

export const GET_CUSTOMER_STATEMENT = Symbol('GET_CUSTOMER_STATEMENT');

export interface CustomerStatement {
  readonly customer: Customer;
  readonly balance: Money;
  /** Oldest first, each with the running balance. */
  readonly lines: readonly StatementLine[];
}

export type GetCustomerStatement = (
  ctx: TenantContext,
  customerId: string,
) => Promise<Result<CustomerStatement, DomainError>>;

export interface GetCustomerStatementDeps {
  readonly customers: CustomerRepository;
  readonly ledger: CreditLedgerRepository;
  readonly withTransaction: WithTransaction;
}

/** S6: the ledger of one customer in order with its balance. Owner and employee. */
export async function getCustomerStatement(
  deps: GetCustomerStatementDeps,
  ctx: TenantContext,
  customerId: string,
): Promise<Result<CustomerStatement, DomainError>> {
  const allowed = authorize(ctx, 'receivables.read');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx): Promise<Result<CustomerStatement, DomainError>> => {
    const customer = await deps.customers.findById(tx, ctx.tenantId, customerId);
    if (!customer) return err(new CustomerNotFoundError('Customer not found'));
    const entries = await deps.ledger.entriesOf(tx, ctx.tenantId, customerId);
    return ok({ customer, balance: balanceOf(entries), lines: statementOf(entries) });
  });
}
