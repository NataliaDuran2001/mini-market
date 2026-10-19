import type { CreateSupplierRequest } from '@mini-market/contracts/purchasing';
import { err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { SupplierNameTakenError } from '../domain/errors';
import type { Supplier } from '../domain/supplier';
import type { SupplierRepository } from './ports/supplier.repository';

export const CREATE_SUPPLIER = Symbol('CREATE_SUPPLIER');

export type CreateSupplier = (
  ctx: TenantContext,
  input: CreateSupplierRequest,
) => Promise<Result<Supplier, DomainError>>;

export interface CreateSupplierDeps {
  readonly suppliers: SupplierRepository;
  readonly withTransaction: WithTransaction;
}

/** Owner only (docs/01-domain.md section 4). The name is unique in the tenant, ignoring case. */
export async function createSupplier(
  deps: CreateSupplierDeps,
  ctx: TenantContext,
  input: CreateSupplierRequest,
): Promise<Result<Supplier, DomainError>> {
  const allowed = requirePermission(ctx, 'suppliers.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx): Promise<Result<Supplier, DomainError>> => {
    await deps.suppliers.lockNames(tx, ctx.tenantId);
    if (await deps.suppliers.nameTaken(tx, ctx.tenantId, input.name)) {
      return err(new SupplierNameTakenError('A supplier with this name already exists'));
    }
    const details = {
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      taxId: input.taxId ?? null,
      notes: input.notes ?? null,
    };
    return ok(await deps.suppliers.insert(tx, ctx.tenantId, details, ctx.userId));
  });
}
