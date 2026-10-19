// Public API of the catalog module: the only file other modules may import.
export { CatalogModule } from './catalog.module';
export { CATALOG_PERMISSIONS } from './catalog.permissions';
export { CREATE_CATALOG_ITEM } from './application/create-catalog-item';
export type { CreateCatalogItem } from './application/create-catalog-item';
export { DEACTIVATE_CATALOG_ITEM } from './application/deactivate-catalog-item';
export type { DeactivateCatalogItem } from './application/deactivate-catalog-item';
export { LIST_CATALOG } from './application/list-catalog';
export type { ListCatalog } from './application/list-catalog';
export { UPDATE_CATALOG_ITEM } from './application/update-catalog-item';
export type { UpdateCatalogItem } from './application/update-catalog-item';
export { seedPresetCatalogs } from './application/seed-preset-catalogs';
export type { PresetTenant } from './application/seed-preset-catalogs';
export type {
  CatalogItem,
  CatalogKind,
  Category,
  ExpenseCategory,
  PaymentMethod,
  PaymentMethodKind,
  Unit,
} from './domain/catalog-item';
export { DuplicateCatalogItemError } from './domain/errors';
export { presetCatalogsFor } from './domain/presets';
export type { PresetCatalogs } from './domain/presets';
export { DrizzleCatalogRepository } from './infrastructure/drizzle-catalog.repository';
export { categories, expenseCategories, paymentMethods, units } from './infrastructure/schema';
