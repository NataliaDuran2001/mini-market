import type { Money } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../../infrastructure/db/database';
import type {
  CollectionMethod,
  LedgerEntry,
  LedgerKind,
  LedgerReference,
} from '../../domain/credit-ledger';

export interface NewLedgerEntry {
  readonly customerId: string;
  readonly kind: LedgerKind;
  /** Signed: positive for a charge, negative for a payment or a reversal. */
  readonly amount: Money;
  readonly reference: LedgerReference | null;
  readonly paymentMethod: CollectionMethod | null;
  readonly occurredAt: Date;
  readonly createdBy: string;
}

/**
 * The credit ledger. Append-only: there is no update and no delete, a correction is a new line
 * (hard rule 3). Every method takes `tenantId` and puts it in the query.
 */
export interface CreditLedgerRepository {
  append(tx: Transaction, tenantId: string, entry: NewLedgerEntry): Promise<LedgerEntry>;

  /** Sum of the signed lines of one customer. */
  balanceOf(tx: Transaction, tenantId: string, customerId: string): Promise<Money>;

  /** Every line of one customer in write order: by date, then by insertion. */
  entriesOf(tx: Transaction, tenantId: string, customerId: string): Promise<readonly LedgerEntry[]>;

  /** The charge or reversal that points at this record, if any. */
  findByReference(
    tx: Transaction,
    tenantId: string,
    kind: 'charge' | 'reversal',
    reference: LedgerReference,
  ): Promise<LedgerEntry | null>;

  /** Balance of every customer of the tenant that has lines, by customer id. */
  balances(tx: Transaction, tenantId: string): Promise<ReadonlyMap<string, Money>>;

  /** Lines of the given customers, in write order; used to age their debt. */
  entriesOfCustomers(
    tx: Transaction,
    tenantId: string,
    customerIds: readonly string[],
  ): Promise<readonly LedgerEntry[]>;
}
