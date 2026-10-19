import { Module } from '@nestjs/common';
import { SystemClock } from '@mini-market/shared-kernel';
import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { AUDIT_PORT, permissionsProvider } from '../access';
import type { AuditPort } from '../access';
import { registerCatalogSeeder } from '../tenancy';
import { CATALOG_PERMISSIONS } from './catalog.permissions';
import { CREATE_CATALOG_ITEM, createCatalogItem } from './application/create-catalog-item';
import { CREATE_PRODUCT, createProduct } from './application/create-product';
import {
  DEACTIVATE_CATALOG_ITEM,
  deactivateCatalogItem,
} from './application/deactivate-catalog-item';
import { GET_PRODUCT, getProduct } from './application/get-product';
import { LIST_CATALOG, listCatalog } from './application/list-catalog';
import type { CatalogRepository } from './application/ports/catalog.repository';
import type { ProductRepository } from './application/ports/product.repository';
import { SEARCH_PRODUCTS, searchProducts } from './application/search-products';
import { seedPresetCatalogs } from './application/seed-preset-catalogs';
import { SET_PRODUCT_ACTIVE, setProductActive } from './application/set-product-active';
import { UPDATE_CATALOG_ITEM, updateCatalogItem } from './application/update-catalog-item';
import { UPDATE_PRODUCT, updateProduct } from './application/update-product';
import { DrizzleCatalogRepository } from './infrastructure/drizzle-catalog.repository';
import { DrizzleProductRepository } from './infrastructure/drizzle-product.repository';
import { CatalogController } from './presentation/catalog.controller';
import { ProductsController } from './presentation/products.controller';

// Provisioning (issue #13) runs every registered seeder for a new tenant. Loading this module is
// what registers the preset catalogs; the API and the operator script both load it.
registerCatalogSeeder((tx, tenant) =>
  seedPresetCatalogs(
    { catalogs: new DrizzleCatalogRepository(), clock: new SystemClock() },
    tx,
    tenant,
  ),
);

export const CATALOG_REPOSITORY = Symbol('CATALOG_REPOSITORY');
export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

@Module({
  controllers: [CatalogController, ProductsController],
  providers: [
    permissionsProvider('catalog', CATALOG_PERMISSIONS),
    { provide: CATALOG_REPOSITORY, useFactory: () => new DrizzleCatalogRepository() },
    { provide: PRODUCT_REPOSITORY, useFactory: () => new DrizzleProductRepository() },
    {
      provide: LIST_CATALOG,
      useFactory: (catalogs: CatalogRepository, withTransaction: WithTransaction) =>
        listCatalog.bind(null, { catalogs, withTransaction }),
      inject: [CATALOG_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: CREATE_CATALOG_ITEM,
      useFactory: (catalogs: CatalogRepository, clock: Clock, withTransaction: WithTransaction) =>
        createCatalogItem.bind(null, { catalogs, clock, withTransaction }),
      inject: [CATALOG_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: UPDATE_CATALOG_ITEM,
      useFactory: (catalogs: CatalogRepository, clock: Clock, withTransaction: WithTransaction) =>
        updateCatalogItem.bind(null, { catalogs, clock, withTransaction }),
      inject: [CATALOG_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: DEACTIVATE_CATALOG_ITEM,
      useFactory: (catalogs: CatalogRepository, clock: Clock, withTransaction: WithTransaction) =>
        deactivateCatalogItem.bind(null, { catalogs, clock, withTransaction }),
      inject: [CATALOG_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: SEARCH_PRODUCTS,
      useFactory: (products: ProductRepository, withTransaction: WithTransaction) =>
        searchProducts.bind(null, { products, withTransaction }),
      inject: [PRODUCT_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: GET_PRODUCT,
      useFactory: (products: ProductRepository, withTransaction: WithTransaction) =>
        getProduct.bind(null, { products, withTransaction }),
      inject: [PRODUCT_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: CREATE_PRODUCT,
      useFactory: (products: ProductRepository, clock: Clock, withTransaction: WithTransaction) =>
        createProduct.bind(null, { products, clock, withTransaction }),
      inject: [PRODUCT_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: UPDATE_PRODUCT,
      useFactory: (
        products: ProductRepository,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => updateProduct.bind(null, { products, audit, clock, withTransaction }),
      inject: [PRODUCT_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: SET_PRODUCT_ACTIVE,
      useFactory: (
        products: ProductRepository,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => setProductActive.bind(null, { products, audit, clock, withTransaction }),
      inject: [PRODUCT_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
    },
  ],
  exports: [
    CATALOG_REPOSITORY,
    CREATE_CATALOG_ITEM,
    CREATE_PRODUCT,
    DEACTIVATE_CATALOG_ITEM,
    GET_PRODUCT,
    LIST_CATALOG,
    PRODUCT_REPOSITORY,
    SEARCH_PRODUCTS,
    SET_PRODUCT_ACTIVE,
    UPDATE_CATALOG_ITEM,
    UPDATE_PRODUCT,
  ],
})
export class CatalogModule {}
