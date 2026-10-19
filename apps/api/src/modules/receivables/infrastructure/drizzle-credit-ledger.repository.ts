import { Money } from '@mini-market/shared-kernel';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  CreditLedgerRepository,
  NewLedgerEntry,
} from '../application/ports/credit-ledger.repository';
import type { CollectionMethod, LedgerEntry, LedgerKind } from '../domain/credit-ledger';
import type { LedgerReference } from '../domain/credit-ledger';
import { creditLedger } from './schema';

type Row = typeof creditLedger.$inferSelect;

// The CHECK constraints of the table only allow these values.
const asKind = (value: string): LedgerKind => value as LedgerKind;
const asMethod = (value: string | null): CollectionMethod | null => value as CollectionMethod | null;

const toEntry = (row: Row): LedgerEntry => ({
  id: row.id,
  tenantId: row.tenantId,
  customerId: row.customerId,
  kind: asKind(row.kind),
  amount: Money.fromCentavos(row.amountCentavos),
  reference:
    row.referenceType !== null && row.referenceId !== null
      ? { type: row.referenceType, id: row.referenceId }
      : null,
  paymentMethod: asMethod(row.paymentMethod),
  occurredAt: row.occurredAt,
  createdBy: row.createdBy,
});

const inWriteOrder = [asc(creditLedger.occurredAt), asc(creditLedger.seq)];

const balanceSql = sql<string>`coalesce(sum(${creditLedger.amountCentavos}), 0)`;

/** Inserts and reads only: the ledger has no update and no delete. */
export class DrizzleCreditLedgerRepository implements CreditLedgerRepository {
  async append(tx: Transaction, tenantId: string, entry: NewLedgerEntry): Promise<LedgerEntry> {
    const [row] = await tx
      .insert(creditLedger)
      .values({
        tenantId,
        customerId: entry.customerId,
        kind: entry.kind,
        amountCentavos: entry.amount.toCentavos(),
        referenceType: entry.reference?.type ?? null,
        referenceId: entry.reference?.id ?? null,
        paymentMethod: entry.paymentMethod,
        occurredAt: entry.occurredAt,
        createdBy: entry.createdBy,
      })
      .returning();
    if (!row) throw new Error('credit ledger insert returned no row');
    return toEntry(row);
  }

  async balanceOf(tx: Transaction, tenantId: string, customerId: string): Promise<Money> {
    const [row] = await tx
      .select({ balance: balanceSql })
      .from(creditLedger)
      .where(and(eq(creditLedger.tenantId, tenantId), eq(creditLedger.customerId, customerId)));
    return Money.fromCentavos(BigInt(row?.balance ?? '0'));
  }

  async entriesOf(
    tx: Transaction,
    tenantId: string,
    customerId: string,
  ): Promise<readonly LedgerEntry[]> {
    const rows = await tx
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.tenantId, tenantId), eq(creditLedger.customerId, customerId)))
      .orderBy(...inWriteOrder);
    return rows.map(toEntry);
  }

  async findByReference(
    tx: Transaction,
    tenantId: string,
    kind: 'charge' | 'reversal',
    reference: LedgerReference,
  ): Promise<LedgerEntry | null> {
    const [row] = await tx
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.tenantId, tenantId),
          eq(creditLedger.kind, kind),
          eq(creditLedger.referenceType, reference.type),
          eq(creditLedger.referenceId, reference.id),
        ),
      )
      .limit(1);
    return row ? toEntry(row) : null;
  }

  async balances(tx: Transaction, tenantId: string): Promise<ReadonlyMap<string, Money>> {
    const rows = await tx
      .select({ customerId: creditLedger.customerId, balance: balanceSql })
      .from(creditLedger)
      .where(eq(creditLedger.tenantId, tenantId))
      .groupBy(creditLedger.customerId);
    return new Map(rows.map((row) => [row.customerId, Money.fromCentavos(BigInt(row.balance))]));
  }

  async entriesOfCustomers(
    tx: Transaction,
    tenantId: string,
    customerIds: readonly string[],
  ): Promise<readonly LedgerEntry[]> {
    if (customerIds.length === 0) return [];
    const rows = await tx
      .select()
      .from(creditLedger)
      .where(
        and(eq(creditLedger.tenantId, tenantId), inArray(creditLedger.customerId, [...customerIds])),
      )
      .orderBy(...inWriteOrder);
    return rows.map(toEntry);
  }
}
