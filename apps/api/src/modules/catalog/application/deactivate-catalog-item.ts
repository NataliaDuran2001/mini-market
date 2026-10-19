import type { Result } from '@mini-market/shared-kernel';
import type { TenantContext } from '../../access';
import type { CatalogItem } from '../domain/catalog-item';
import { updateCatalogItem } from './update-catalog-item';
import type { UpdateCatalogItemDeps, UpdateCatalogItemError } from './update-catalog-item';

export const DEACTIVATE_CATALOG_ITEM = Symbol('DEACTIVATE_CATALOG_ITEM');

export type DeactivateCatalogItem = (
  ctx: TenantContext,
  kind: string,
  id: string,
) => Promise<Result<CatalogItem, UpdateCatalogItemError>>;

/**
 * Retires an item: pickers stop offering it, records that reference it keep it. Delete does not
 * exist (ADR 0007). Owner only, like every catalog change.
 */
export function deactivateCatalogItem(
  deps: UpdateCatalogItemDeps,
  ctx: TenantContext,
  kind: string,
  id: string,
): Promise<Result<CatalogItem, UpdateCatalogItemError>> {
  return updateCatalogItem(deps, ctx, kind, id, { isActive: false });
}
