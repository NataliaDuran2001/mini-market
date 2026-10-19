import { updateCatalogItemInputSchemas } from '@mini-market/contracts/catalog';
import { err } from '@mini-market/shared-kernel';
import type {
  Clock,
  ForbiddenError,
  NotFoundError,
  Result,
  ValidationError,
} from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { WRITE_PERMISSION } from '../domain/catalog-item';
import type { CatalogItem } from '../domain/catalog-item';
import type { DuplicateCatalogItemError } from '../domain/errors';
import { parseCatalogItemId, parseCatalogKind, validationError } from './catalog-input';
import type { CatalogRepository } from './ports/catalog.repository';

export const UPDATE_CATALOG_ITEM = Symbol('UPDATE_CATALOG_ITEM');

export interface UpdateCatalogItemDeps {
  readonly catalogs: CatalogRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

export type UpdateCatalogItemError =
  ForbiddenError | NotFoundError | ValidationError | DuplicateCatalogItemError;

export type UpdateCatalogItem = (
  ctx: TenantContext,
  kind: string,
  id: string,
  patch: unknown,
) => Promise<Result<CatalogItem, UpdateCatalogItemError>>;

/**
 * Owner only. Renames, reorders, retires (`isActive: false`) or reactivates an item. An item is
 * never deleted: products, purchases and sales keep pointing at it (ADR 0007).
 */
export async function updateCatalogItem(
  deps: UpdateCatalogItemDeps,
  ctx: TenantContext,
  kind: string,
  id: string,
  patch: unknown,
): Promise<Result<CatalogItem, UpdateCatalogItemError>> {
  const allowed = requirePermission(ctx, WRITE_PERMISSION);
  if (!allowed.ok) return allowed;
  const parsedKind = parseCatalogKind(kind);
  if (!parsedKind.ok) return parsedKind;
  const parsedId = parseCatalogItemId(id);
  if (!parsedId.ok) return parsedId;
  const parsed = updateCatalogItemInputSchemas[parsedKind.value].safeParse(patch);
  if (!parsed.success) return err(validationError('Catalog patch is invalid', parsed.error));
  return deps.withTransaction(ctx, (tx) =>
    deps.catalogs.update(
      tx,
      ctx.tenantId,
      parsedKind.value,
      parsedId.value,
      parsed.data,
      deps.clock.now(),
    ),
  );
}
