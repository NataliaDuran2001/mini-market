import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';

export interface StockDrift {
  readonly tenantId: string;
  readonly productId: string;
  /** What `stock_levels` says. */
  readonly level: string;
  /** What the sum of `stock_movements` says. */
  readonly ledger: string;
}

/**
 * Recomputes every level from the ledger and returns the products where they disagree (ADR 0005).
 * Sees the rows the connection can see: the operator job runs with a role that bypasses row level
 * security and so checks every tenant; inside a tenant transaction it checks that tenant.
 */
export async function findStockDrift(tx: Transaction): Promise<readonly StockDrift[]> {
  const result = await tx.execute(sql`
    select coalesce(l.tenant_id, m.tenant_id) as "tenantId",
           coalesce(l.product_id, m.product_id) as "productId",
           coalesce(l.quantity, 0)::text as "level",
           coalesce(m.total, 0)::text as "ledger"
      from stock_levels l
      full join (select tenant_id, product_id, sum(quantity) as total
                   from stock_movements group by tenant_id, product_id) m
        on m.tenant_id = l.tenant_id and m.product_id = l.product_id
     where coalesce(l.quantity, 0) <> coalesce(m.total, 0)
     order by 1, 2`);
  // postgres.js answers the rows as an array, PGlite inside `rows`.
  const rows = (
    Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
  ) as StockDrift[];
  return rows;
}
