import { Module } from '@nestjs/common';
import { SystemClock } from '@mini-market/shared-kernel';
import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { permissionsProvider } from '../access';
import { registerCatalogSeeder } from '../tenancy';
import { CATALOG_PERMISSIONS } from './catalog.permissions';
import { CREATE_CATALOG_ITEM, createCatalogItem } from './application/create-catalog-item';
import {
  DEACTIVATE_CATALOG_ITEM,
  deactivateCatalogItem,
} from './application/deactivate-catalog-item';
import { LIST_CATALOG, listCatalog } from './application/list-catalog';
import type { CatalogRepository } from './application/ports/catalog.repository';
import { seedPresetCatalogs } from './application/seed-preset-catalogs';
import { UPDATE_CATALOG_ITEM, updateCatalogItem } from './application/update-catalog-item';
import { DrizzleCatalogRepository } from './infrastructure/drizzle-catalog.repository';
import { CatalogController } from './presentation/catalog.controller';

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

@Module({
  controllers: [CatalogController],
  providers: [
    permissionsProvider('catalog', CATALOG_PERMISSIONS),
    { provide: CATALOG_REPOSITORY, useFactory: () => new DrizzleCatalogRepository() },
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
  ],
  exports: [
    CATALOG_REPOSITORY,
    CREATE_CATALOG_ITEM,
    DEACTIVATE_CATALOG_ITEM,
    LIST_CATALOG,
    UPDATE_CATALOG_ITEM,
  ],
})
export class CatalogModule {}
