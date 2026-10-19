import type { NotFoundError, Result } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type {
  CatalogItemMap,
  CatalogKind,
  CatalogPatchMap,
  NewCatalogItemMap,
  PaymentMethodKind,
} from '../../domain/catalog-item';
import type { DuplicateCatalogItemError } from '../../domain/errors';
import type { PresetCatalogs } from '../../domain/presets';

export interface CatalogFilter {
  /** Pickers want only the items that can still be chosen. */
  readonly activeOnly: boolean;
  /** Payment method kinds to leave out (`credit` while the credit_sales module is off). */
  readonly excludePaymentKinds: readonly PaymentMethodKind[];
}

/**
 * Catalog storage for the four kinds. Every method takes the tenant explicitly and the caller's
 * transaction, which row level security already binds to that tenant (ADR 0001). Nothing deletes.
 */
export interface CatalogRepository {
  list<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    filter: CatalogFilter,
  ): Promise<readonly CatalogItemMap[K][]>;

  create<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    values: NewCatalogItemMap[K],
    now: Date,
  ): Promise<Result<CatalogItemMap[K], DuplicateCatalogItemError>>;

  update<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    id: string,
    patch: CatalogPatchMap[K],
    now: Date,
  ): Promise<Result<CatalogItemMap[K], NotFoundError | DuplicateCatalogItemError>>;

  /** Inserts the preset rows that are missing; rows that already exist are left as they are. */
  seed(tx: Transaction, tenantId: string, catalogs: PresetCatalogs, now: Date): Promise<void>;
}
