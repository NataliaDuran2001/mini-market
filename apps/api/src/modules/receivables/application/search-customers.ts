import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { TenantContext } from '../../access';
import type { Customer } from '../domain/customer';
import { authorize } from './authorize';
import type { CustomerFilter, CustomerRepository } from './ports/customer.repository';

export const SEARCH_CUSTOMERS = Symbol('SEARCH_CUSTOMERS');

export type SearchCustomers = (
  ctx: TenantContext,
  filter: CustomerFilter,
) => Promise<Result<readonly Customer[], DomainError>>;

export interface SearchCustomersDeps {
  readonly customers: CustomerRepository;
  readonly withTransaction: WithTransaction;
}

/** Owner and employee: whoever sells on credit picks a customer (`receivables.read`). */
export async function searchCustomers(
  deps: SearchCustomersDeps,
  ctx: TenantContext,
  filter: CustomerFilter,
): Promise<Result<readonly Customer[], DomainError>> {
  const allowed = authorize(ctx, 'receivables.read');
  if (!allowed.ok) return allowed;
  return ok(await deps.withTransaction(ctx, (tx) => deps.customers.list(tx, ctx.tenantId, filter)));
}
