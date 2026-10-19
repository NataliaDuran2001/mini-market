// Public API of the inventory module: the only file other modules may import.
export { InventoryModule } from './inventory.module';
export { INVENTORY_PERMISSIONS } from './inventory.permissions';
export { ADJUST_STOCK } from './application/adjust-stock';
export type { AdjustStock } from './application/adjust-stock';
export {
  GET_STOCK_LEVEL,
  LIST_LOW_STOCK,
  LIST_MOVEMENTS,
  LIST_STOCK_LEVELS,
} from './application/list-stock';
export type {
  GetStockLevel,
  ListLowStock,
  ListMovements,
  ListStockLevels,
} from './application/list-stock';
export { RECORD_MOVEMENTS } from './application/record-movements';
export type {
  LevelChange,
  RecordMovements,
  RecordMovementsError,
} from './application/record-movements';
export { APPLY_INITIAL_STOCK, SET_INITIAL_STOCK } from './application/set-initial-stock';
export type { SetInitialStock, SetInitialStockError } from './application/set-initial-stock';
export type { StockLogger, StockRepository } from './application/ports/stock.repository';
export { InsufficientStockError, StockAlreadyStartedError } from './domain/errors';
export type { InventoryEvent, StockBelowMinimum } from './domain/events';
export type { MovementKind, NewMovement, StockLevel, StockMovement } from './domain/movement';
export { isLowStock } from './domain/stock-rules';
export { DrizzleStockRepository } from './infrastructure/drizzle-stock.repository';
export { stockLevels, stockMovements } from './infrastructure/schema';
export { findStockDrift } from './infrastructure/stock-drift';
export type { StockDrift } from './infrastructure/stock-drift';
export { STOCK_REPOSITORY } from './inventory.module';
