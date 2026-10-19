import type { Transaction } from '../../../infrastructure/db/database';
import { DrizzleCatalogRepository } from '../../catalog';
import type { CatalogLookup } from '../application/ports/catalog-lookup.port';

/**
 * Reads the catalogs through the public repository of the catalog module, inside the caller's
 * transaction (so row level security still binds the tenant). Catalogs are small lists, so the
 * lookup lists the active items and searches them.
 */
export class CatalogModuleLookup implements CatalogLookup {
  constructor(
    private readonly catalogs: DrizzleCatalogRepository = new DrizzleCatalogRepository(),
  ) {}

  async isUsableExpenseCategory(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    const items = await this.catalogs.list(tx, tenantId, 'expense-categories', {
      activeOnly: true,
      excludePaymentKinds: [],
    });
    return items.some((item) => item.id === id);
  }

  async isUsablePaymentMethod(tx: Transaction, tenantId: string, id: string): Promise<boolean> {
    const items = await this.catalogs.list(tx, tenantId, 'payment-methods', {
      activeOnly: true,
      // `credit` is a customer's account, not a way to pay a supplier or an expense.
      excludePaymentKinds: ['credit'],
    });
    return items.some((item) => item.id === id);
  }
}
