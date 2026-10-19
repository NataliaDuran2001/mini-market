import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { Supplier } from '../domain/supplier';
import type { SupplierFilter, SupplierRepository } from './ports/supplier.repository';

export const LIST_SUPPLIERS = Symbol('LIST_SUPPLIERS');

export type ListSuppliers = (
  ctx: TenantContext,
  filter: SupplierFilter,
) => Promise<Result<readonly Supplier[], DomainError>>;

export interface ListSuppliersDeps {
  readonly suppliers: SupplierRepository;
  readonly withTransaction: WithTransaction;
}

/** Owner and employee: whoever registers purchases picks a supplier (`purchases.create`). */
export async function listSuppliers(
  deps: ListSuppliersDeps,
  ctx: TenantContext,
  filter: SupplierFilter,
): Promise<Result<readonly Supplier[], DomainError>> {
  const allowed = requirePermission(ctx, 'purchases.create');
  if (!allowed.ok) return allowed;
  return ok(await deps.withTransaction(ctx, (tx) => deps.suppliers.list(tx, ctx.tenantId, filter)));
}
