import type { UpdateSupplierRequest } from '@mini-market/contracts/purchasing';
import { err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { SupplierNameTakenError, SupplierNotFoundError } from '../domain/errors';
import type { Supplier, SupplierDetailsPatch } from '../domain/supplier';
import type { SupplierRepository } from './ports/supplier.repository';

export const UPDATE_SUPPLIER = Symbol('UPDATE_SUPPLIER');

export type UpdateSupplier = (
  ctx: TenantContext,
  id: string,
  input: UpdateSupplierRequest,
) => Promise<Result<Supplier, DomainError>>;

export interface UpdateSupplierDeps {
  readonly suppliers: SupplierRepository;
  readonly withTransaction: WithTransaction;
}

/** Only the keys the caller sent change; a blank optional field clears it. */
function toPatch(input: UpdateSupplierRequest): SupplierDetailsPatch {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
}

export async function updateSupplier(
  deps: UpdateSupplierDeps,
  ctx: TenantContext,
  id: string,
  input: UpdateSupplierRequest,
): Promise<Result<Supplier, DomainError>> {
  const allowed = requirePermission(ctx, 'suppliers.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx): Promise<Result<Supplier, DomainError>> => {
    await deps.suppliers.lockNames(tx, ctx.tenantId);
    if (!(await deps.suppliers.findById(tx, ctx.tenantId, id))) {
      return err(new SupplierNotFoundError('Supplier not found'));
    }
    if (
      input.name !== undefined &&
      (await deps.suppliers.nameTaken(tx, ctx.tenantId, input.name, id))
    ) {
      return err(new SupplierNameTakenError('A supplier with this name already exists'));
    }
    const updated = await deps.suppliers.update(tx, ctx.tenantId, id, toPatch(input));
    return updated ? ok(updated) : err(new SupplierNotFoundError('Supplier not found'));
  });
}
