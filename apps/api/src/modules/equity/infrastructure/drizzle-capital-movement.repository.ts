import { Money } from '@mini-market/shared-kernel';
import { count, desc, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  CapitalMovementPage,
  CapitalMovementRepository,
  NewCapitalMovement,
} from '../application/ports/capital-movement.repository';
import type {
  CapitalMovement,
  CapitalMovementKind,
  CapitalTotals,
} from '../domain/capital-movement';
import { capitalMovements } from './schema';

type Row = typeof capitalMovements.$inferSelect;

// The CHECK constraint of the table only allows these values.
const asKind = (value: string): CapitalMovementKind => value as CapitalMovementKind;

const toMovement = (row: Row): CapitalMovement => ({
  id: row.id,
  tenantId: row.tenantId,
  kind: asKind(row.kind),
  amount: Money.fromCentavos(row.amountCentavos),
  occurredAt: row.occurredAt,
  note: row.note,
  createdBy: row.createdBy,
});

/** Inserts and reads only: the ledger has no update and no delete. */
export class DrizzleCapitalMovementRepository implements CapitalMovementRepository {
  async lockLedger(tx: Transaction, tenantId: string): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`capital_movements:${tenantId}`}))`,
    );
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    movement: NewCapitalMovement,
  ): Promise<CapitalMovement> {
    const [row] = await tx
      .insert(capitalMovements)
      .values({
        tenantId,
        kind: movement.kind,
        amountCentavos: movement.amount.toCentavos(),
        occurredAt: movement.occurredAt,
        note: movement.note,
        createdBy: movement.createdBy,
      })
      .returning();
    if (!row) throw new Error('capital movement insert returned no row');
    return toMovement(row);
  }

  async list(
    tx: Transaction,
    tenantId: string,
    page: { readonly limit: number; readonly offset: number },
  ): Promise<CapitalMovementPage> {
    const rows = await tx
      .select()
      .from(capitalMovements)
      .where(eq(capitalMovements.tenantId, tenantId))
      .orderBy(
        desc(capitalMovements.occurredAt),
        desc(capitalMovements.createdAt),
        desc(capitalMovements.id),
      )
      .limit(page.limit)
      .offset(page.offset);
    const [counted] = await tx
      .select({ total: count() })
      .from(capitalMovements)
      .where(eq(capitalMovements.tenantId, tenantId));
    return { items: rows.map(toMovement), total: counted?.total ?? 0 };
  }

  async totals(tx: Transaction, tenantId: string): Promise<CapitalTotals> {
    const sumOf = (kind: CapitalMovementKind) =>
      sql<string>`coalesce(sum(${capitalMovements.amountCentavos}) filter (where ${capitalMovements.kind} = ${kind}), 0)`;
    const [row] = await tx
      .select({ contributed: sumOf('contribution'), withdrawn: sumOf('withdrawal') })
      .from(capitalMovements)
      .where(eq(capitalMovements.tenantId, tenantId));
    return {
      contributed: Money.fromCentavos(BigInt(row?.contributed ?? '0')),
      withdrawn: Money.fromCentavos(BigInt(row?.withdrawn ?? '0')),
    };
  }
}
