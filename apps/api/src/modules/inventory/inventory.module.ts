import { Module } from '@nestjs/common';
import type { Clock } from '@mini-market/shared-kernel';
import { Logger } from 'nestjs-pino';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { AUDIT_PORT, permissionsProvider } from '../access';
import type { AuditPort } from '../access';
import { CatalogModule, PRODUCT_REPOSITORY } from '../catalog';
import type { ProductRepository } from '../catalog';
import { ADJUST_STOCK, adjustStock } from './application/adjust-stock';
import {
  GET_STOCK_LEVEL,
  LIST_LOW_STOCK,
  LIST_MOVEMENTS,
  LIST_STOCK_LEVELS,
  getStockLevel,
  listLowStock,
  listMovements,
  listStockLevels,
} from './application/list-stock';
import type { StockLogger, StockRepository } from './application/ports/stock.repository';
import { RECORD_MOVEMENTS, recordMovements } from './application/record-movements';
import {
  APPLY_INITIAL_STOCK,
  SET_INITIAL_STOCK,
  applyInitialStock,
  setInitialStock,
} from './application/set-initial-stock';
import { INVENTORY_PERMISSIONS } from './inventory.permissions';
import { DrizzleStockRepository } from './infrastructure/drizzle-stock.repository';
import { InventoryController } from './presentation/inventory.controller';

export const STOCK_REPOSITORY = Symbol('STOCK_REPOSITORY');
const STOCK_LOGGER = Symbol('STOCK_LOGGER');

@Module({
  imports: [CatalogModule],
  controllers: [InventoryController],
  providers: [
    permissionsProvider('inventory', INVENTORY_PERMISSIONS),
    { provide: STOCK_REPOSITORY, useFactory: () => new DrizzleStockRepository() },
    {
      provide: STOCK_LOGGER,
      useFactory: (logger: Logger): StockLogger => ({
        warn: (data, message) => logger.warn(data, message),
      }),
      inject: [Logger],
    },
    {
      provide: RECORD_MOVEMENTS,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        logger: StockLogger,
        clock: Clock,
      ) => recordMovements.bind(null, { stock, products, logger, clock }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, STOCK_LOGGER, CLOCK],
    },
    {
      provide: SET_INITIAL_STOCK,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        logger: StockLogger,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => setInitialStock.bind(null, { stock, products, logger, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, STOCK_LOGGER, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: APPLY_INITIAL_STOCK,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        logger: StockLogger,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => applyInitialStock.bind(null, { stock, products, logger, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, STOCK_LOGGER, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: ADJUST_STOCK,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        logger: StockLogger,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => adjustStock.bind(null, { stock, products, logger, audit, clock, withTransaction }),
      inject: [
        STOCK_REPOSITORY,
        PRODUCT_REPOSITORY,
        STOCK_LOGGER,
        AUDIT_PORT,
        CLOCK,
        WITH_TRANSACTION,
      ],
    },
    {
      provide: LIST_STOCK_LEVELS,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => listStockLevels.bind(null, { stock, products, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: GET_STOCK_LEVEL,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => getStockLevel.bind(null, { stock, products, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: LIST_MOVEMENTS,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => listMovements.bind(null, { stock, products, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: LIST_LOW_STOCK,
      useFactory: (
        stock: StockRepository,
        products: ProductRepository,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => listLowStock.bind(null, { stock, products, clock, withTransaction }),
      inject: [STOCK_REPOSITORY, PRODUCT_REPOSITORY, CLOCK, WITH_TRANSACTION],
    },
  ],
  exports: [
    ADJUST_STOCK,
    APPLY_INITIAL_STOCK,
    GET_STOCK_LEVEL,
    LIST_LOW_STOCK,
    LIST_MOVEMENTS,
    LIST_STOCK_LEVELS,
    RECORD_MOVEMENTS,
    SET_INITIAL_STOCK,
    STOCK_REPOSITORY,
  ],
})
export class InventoryModule {}
