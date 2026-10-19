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
export { CREATE_PRODUCT } from './application/create-product';
export type { CreateProduct } from './application/create-product';
export { GET_PRODUCT } from './application/get-product';
export type { GetProduct } from './application/get-product';
export { SEARCH_PRODUCTS } from './application/search-products';
export type { SearchProducts } from './application/search-products';
export { SET_PRODUCT_ACTIVE } from './application/set-product-active';
export type { SetProductActive } from './application/set-product-active';
export { UPDATE_PRODUCT } from './application/update-product';
export type { UpdateProduct } from './application/update-product';
export type { ProductRepository } from './application/ports/product.repository';
export { DuplicateCatalogItemError, DuplicateCodeError } from './domain/errors';
export type { NewProduct, Presentation, Product, ProductPatch } from './domain/product';
export { DrizzleProductRepository } from './infrastructure/drizzle-product.repository';
export { PRODUCT_REPOSITORY } from './catalog.module';
export { presetCatalogsFor } from './domain/presets';
export type { PresetCatalogs } from './domain/presets';
export { DrizzleCatalogRepository } from './infrastructure/drizzle-catalog.repository';
export {
  categories,
  expenseCategories,
  paymentMethods,
  productPresentations,
  products,
  units,
} from './infrastructure/schema';
