import { err, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { SupplierNotFoundError } from '../domain/errors';
import type { Supplier } from '../domain/supplier';
import type { SupplierRepository } from './ports/supplier.repository';

export const SET_SUPPLIER_ACTIVE = Symbol('SET_SUPPLIER_ACTIVE');

export type SetSupplierActive = (
  ctx: TenantContext,
  id: string,
  active: boolean,
) => Promise<Result<Supplier, DomainError>>;

export interface SetSupplierActiveDeps {
  readonly suppliers: SupplierRepository;
  readonly withTransaction: WithTransaction;
}

/** Deactivating hides the supplier from the pickers; nothing is deleted. Repeating it is a no-op. */
export async function setSupplierActive(
  deps: SetSupplierActiveDeps,
  ctx: TenantContext,
  id: string,
  active: boolean,
): Promise<Result<Supplier, DomainError>> {
  const allowed = requirePermission(ctx, 'suppliers.manage');
  if (!allowed.ok) return allowed;

  return deps.withTransaction(ctx, async (tx): Promise<Result<Supplier, DomainError>> => {
    const updated = await deps.suppliers.update(tx, ctx.tenantId, id, { active });
    return updated ? ok(updated) : err(new SupplierNotFoundError('Supplier not found'));
  });
}
