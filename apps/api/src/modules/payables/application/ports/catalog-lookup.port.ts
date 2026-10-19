import type { Transaction } from '../../../../infrastructure/db/database';

/**
 * What the expenses need to know about the catalogs of the tenant (the catalog module owns them).
 * A foreign key alone would accept an id of another tenant, so both checks name the tenant.
 */
export interface CatalogLookup {
  /** An expense category of the tenant that is still switched on. */
  isUsableExpenseCategory(tx: Transaction, tenantId: string, id: string): Promise<boolean>;

  /** A payment method of the tenant that is switched on and can pay out money (not `credit`). */
  isUsablePaymentMethod(tx: Transaction, tenantId: string, id: string): Promise<boolean>;
}
