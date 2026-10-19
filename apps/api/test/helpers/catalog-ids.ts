import { catalogSeeders, seedCatalogs } from '../../src/modules/tenancy';
// Loading the catalog module registers its preset seeder with tenancy (issue #18).
import '../../src/modules/catalog';
import type { TestDb } from '../harness';

export interface CatalogIds {
  readonly rent: string;
  readonly electricity: string;
  readonly cash: string;
  readonly transfer: string;
  /** The `credit` payment method: a customer's account, never a way to pay an expense. */
  readonly credit: string;
}

/** Seeds the minimarket preset catalogs of `tenantId` and returns the ids the expense tests use. */
export async function seedCatalogIds(testDb: TestDb, tenantId: string): Promise<CatalogIds> {
  await seedCatalogs(
    { withTransaction: testDb.asAdmin, seeders: catalogSeeders },
    { tenantId, preset: 'minimarket' },
  );
  const idOf = async (table: string, column: string, value: string): Promise<string> => {
    const { rows } = await testDb.client.query<{ id: string }>(
      `select id from ${table} where tenant_id = $1 and ${column} = $2`,
      [tenantId, value],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error(`Seed missing: ${table} ${value}`);
    return id;
  };
  return {
    rent: await idOf('expense_categories', 'name', 'Alquiler'),
    electricity: await idOf('expense_categories', 'name', 'Luz'),
    cash: await idOf('payment_methods', 'code', 'cash'),
    transfer: await idOf('payment_methods', 'code', 'transfer'),
    credit: await idOf('payment_methods', 'code', 'credit'),
  };
}
