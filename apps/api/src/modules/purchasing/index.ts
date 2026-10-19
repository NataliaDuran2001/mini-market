// Public API of the purchasing module: the only file other modules may import.
export type { Supplier } from './domain/supplier';
export { suppliers } from './infrastructure/schema';
export { PURCHASING_PERMISSIONS } from './purchasing.permissions';
export { PurchasingModule } from './purchasing.module';
