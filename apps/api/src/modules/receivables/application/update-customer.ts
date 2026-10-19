import type { UpdateCustomerRequest } from '@mini-market/contracts/receivables';
import { err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import { CustomerNotFoundError } from '../domain/errors';
import type { Customer, CustomerPatch } from '../domain/customer';
import { authorize } from './authorize';
import type { CustomerRepository } from './ports/customer.repository';

export const UPDATE_CUSTOMER = Symbol('UPDATE_CUSTOMER');

export type UpdateCustomer = (
  ctx: TenantContext,
  id: string,
  input: UpdateCustomerRequest,
) => Promise<Result<Customer, DomainError>>;

export interface UpdateCustomerDeps {
  readonly customers: CustomerRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Only the keys the caller sent change; a blank optional field clears it. */
function toPatch(input: UpdateCustomerRequest): CustomerPatch {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.documentId !== undefined ? { documentId: input.documentId } : {}),
    ...(input.creditLimitCentavos !== undefined
      ? {
          creditLimitCentavos:
            input.creditLimitCentavos === null ? null : BigInt(input.creditLimitCentavos),
        }
      : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

/**
 * Contact data is open to whoever collects; the credit limit and `active` are the owner's
 * (`receivables.manage`). A change of limit is audited.
 */
export async function updateCustomer(
  deps: UpdateCustomerDeps,
  ctx: TenantContext,
  id: string,
  input: UpdateCustomerRequest,
): Promise<Result<Customer, DomainError>> {
  const allowed = authorize(ctx, 'receivables.collect');
  if (!allowed.ok) return allowed;
  if (input.creditLimitCentavos !== undefined || input.active !== undefined) {
    const manage = requirePermission(ctx, 'receivables.manage');
    if (!manage.ok) return manage;
  }

  return deps.withTransaction(ctx, async (tx): Promise<Result<Customer, DomainError>> => {
    const before = await deps.customers.lockById(tx, ctx.tenantId, id);
    const updated = before && (await deps.customers.update(tx, ctx.tenantId, id, toPatch(input)));
    if (!before || !updated) return err(new CustomerNotFoundError('Customer not found'));
    if (before.creditLimitCentavos !== updated.creditLimitCentavos) {
      await deps.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'customer.credit_limit_changed',
        entity: 'customer',
        entityId: id,
        before: { creditLimitCentavos: asNumber(before.creditLimitCentavos) },
        after: { creditLimitCentavos: asNumber(updated.creditLimitCentavos) },
        at: deps.clock.now(),
      });
    }
    return ok(updated);
  });
}

const asNumber = (centavos: bigint | null): number | null =>
  centavos === null ? null : Number(centavos);
