import { Money, Quantity } from '@mini-market/shared-kernel';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type { Page, StockRepository } from '../application/ports/stock.repository';
import type { MovementKind, NewMovement, StockLevel, StockMovement } from '../domain/movement';
import { stockLevels, stockMovements } from './schema';

type MovementRow = typeof stockMovements.$inferSelect;
type LevelRow = typeof stockLevels.$inferSelect;

const toLevel = (row: LevelRow): StockLevel => ({
  productId: row.productId,
  quantity: Quantity.parse(row.quantity),
  updatedAt: row.updatedAt,
});

const toMovement = (row: MovementRow): StockMovement => ({
  id: row.id,
  productId: row.productId,
  // The table has a check constraint on the six kinds.
  kind: row.kind as MovementKind,
  quantity: Quantity.parse(row.quantity),
  unitCost: row.unitCostCentavos === null ? null : Money.fromCentavos(row.unitCostCentavos),
  referenceType: row.referenceType,
  referenceId: row.referenceId,
  reason: row.reason,
  createdBy: row.createdBy,
  createdAt: row.createdAt,
});

/** Stateless: every method runs on the transaction the caller opened with `withTransaction`. */
export class DrizzleStockRepository implements StockRepository {
  async lockLevel(tx: Transaction, tenantId: string, productId: string): Promise<Quantity> {
    await tx
      .insert(stockLevels)
      .values({ tenantId, productId, quantity: '0' })
      .onConflictDoNothing();
    const [row] = await tx
      .select({ quantity: stockLevels.quantity })
      .from(stockLevels)
      .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, productId)))
      .for('update');
    if (!row) throw new Error('stock level row vanished after being created');
    return Quantity.parse(row.quantity);
  }

  async saveLevel(
    tx: Transaction,
    tenantId: string,
    productId: string,
    quantity: Quantity,
    now: Date,
  ): Promise<void> {
    await tx
      .update(stockLevels)
      .set({ quantity: quantity.toString(), updatedAt: now })
      .where(and(eq(stockLevels.tenantId, tenantId), eq(stockLevels.productId, productId)));
  }

  async insertMovements(
    tx: Transaction,
    tenantId: string,
    userId: string,
    movements: readonly NewMovement[],
    now: Date,
  ): Promise<void> {
    if (movements.length === 0) return;
    await tx.insert(stockMovements).values(
      movements.map((movement) => ({
        tenantId,
        productId: movement.productId,
        kind: movement.kind,
        quantity: movement.quantity.toString(),
        unitCostCentavos: movement.unitCost?.toCentavos() ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        reason: movement.reason?.trim() ?? null,
        createdBy: userId,
        createdAt: now,
      })),
    );
  }

  async hasMovements(tx: Transaction, tenantId: string, productId: string): Promise<boolean> {
    const rows = await tx
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(and(eq(stockMovements.tenantId, tenantId), eq(stockMovements.productId, productId)))
      .limit(1);
    return rows.length > 0;
  }

  async listLevels(
    tx: Transaction,
    tenantId: string,
    filter: {
      readonly productIds?: readonly string[];
      readonly page: number;
      readonly pageSize: number;
    },
  ): Promise<Page<StockLevel>> {
    const where = and(
      eq(stockLevels.tenantId, tenantId),
      filter.productIds ? inArray(stockLevels.productId, [...filter.productIds]) : undefined,
    );
    const rows = await tx
      .select()
      .from(stockLevels)
      .where(where)
      .orderBy(stockLevels.productId)
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    const [total] = await tx.select({ value: count() }).from(stockLevels).where(where);
    return { items: rows.map(toLevel), total: total?.value ?? 0 };
  }

  async allLevels(tx: Transaction, tenantId: string): Promise<readonly StockLevel[]> {
    const rows = await tx.select().from(stockLevels).where(eq(stockLevels.tenantId, tenantId));
    return rows.map(toLevel);
  }

  async listMovements(
    tx: Transaction,
    tenantId: string,
    productId: string,
    paging: { readonly page: number; readonly pageSize: number },
  ): Promise<Page<StockMovement>> {
    const where = and(
      eq(stockMovements.tenantId, tenantId),
      eq(stockMovements.productId, productId),
    );
    const rows = await tx
      .select()
      .from(stockMovements)
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(paging.pageSize)
      .offset((paging.page - 1) * paging.pageSize);
    const [total] = await tx.select({ value: count() }).from(stockMovements).where(where);
    return { items: rows.map(toMovement), total: total?.value ?? 0 };
  }
}
