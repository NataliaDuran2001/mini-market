import type { CreateCustomerRequest } from '@mini-market/contracts/receivables';
import { ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import type { Customer } from '../domain/customer';
import { authorize } from './authorize';
import type { CustomerRepository } from './ports/customer.repository';

export const CREATE_CUSTOMER = Symbol('CREATE_CUSTOMER');

export type CreateCustomer = (
  ctx: TenantContext,
  input: CreateCustomerRequest,
) => Promise<Result<Customer, DomainError>>;

export interface CreateCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/**
 * Owner and employee create customers (`receivables.collect`); setting a credit limit is the
 * owner's call (`receivables.manage`, docs/01-domain.md section 4).
 */
export async function createCustomer(
  deps: CreateCustomerDeps,
  ctx: TenantContext,
  input: CreateCustomerRequest,
): Promise<Result<Customer, DomainError>> {
  const allowed = authorize(ctx, 'receivables.collect');
  if (!allowed.ok) return allowed;
  const limit = input.creditLimitCentavos ?? null;
  if (limit !== null) {
    const manage = requirePermission(ctx, 'receivables.manage');
    if (!manage.ok) return manage;
  }

  return ok(
    await deps.withTransaction(ctx, async (tx) => {
      const customer = await deps.customers.insert(
        tx,
        ctx.tenantId,
        {
          name: input.name,
          phone: input.phone ?? null,
          documentId: input.documentId ?? null,
          creditLimitCentavos: limit === null ? null : BigInt(limit),
          notes: input.notes ?? null,
        },
        ctx.userId,
      );
      if (limit !== null) {
        await deps.audit.record(tx, {
          tenantId: ctx.tenantId,
          actorUserId: ctx.userId,
          action: 'customer.credit_limit_changed',
          entity: 'customer',
          entityId: customer.id,
          before: { creditLimitCentavos: null },
          after: { creditLimitCentavos: limit },
          at: deps.clock.now(),
        });
      }
      return customer;
    }),
  );
}
