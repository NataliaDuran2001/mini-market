import type {
  LowStockItem,
  StockLevel as StockLevelView,
  StockMovementEmployee,
  StockMovementOwner,
} from '@mini-market/contracts/inventory';
import type { TenantContext } from '../../access';
import type { StockLevel, StockMovement } from '../domain/movement';

/** Permission that unlocks cost; declared by the catalog module, owner only. */
const COSTS_READ = 'costs.read';

export const toStockLevelView = (level: StockLevel): StockLevelView => ({
  productId: level.productId,
  quantity: level.quantity.toString(),
  updatedAt: level.updatedAt.toISOString(),
});

/** Employees get the movement without its unit cost (docs/01-domain.md section 4). */
export function toMovementView(
  ctx: Pick<TenantContext, 'can'>,
  movement: StockMovement,
): StockMovementOwner | StockMovementEmployee {
  const common: StockMovementEmployee = {
    id: movement.id,
    productId: movement.productId,
    kind: movement.kind,
    quantity: movement.quantity.toString(),
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    reason: movement.reason,
    createdBy: movement.createdBy,
    createdAt: movement.createdAt.toISOString(),
  };
  if (!ctx.can(COSTS_READ)) return common;
  const centavos = movement.unitCost ? Number(movement.unitCost.toCentavos()) : null;
  if (centavos !== null && !Number.isSafeInteger(centavos)) {
    throw new RangeError('Unit cost does not fit the wire format');
  }
  return { ...common, unitCost: centavos };
}

export type { LowStockItem };
