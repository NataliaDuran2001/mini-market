import type { Transaction } from '../../../infrastructure/db/database';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { Vertical } from '../domain/tenant';

/** What a seeder needs to know about the tenant it fills. */
export interface SeededTenant {
  readonly tenantId: string;
  readonly preset: Vertical;
}

/**
 * Inserts the starting catalogs of a preset (units, categories, ...) for one tenant. It runs in a
 * transaction bound to that tenant, so row level security applies to what it writes. Seeders must
 * be idempotent: provisioning can be repeated.
 */
export type CatalogSeeder = (tx: Transaction, tenant: SeededTenant) => Promise<void>;

/**
 * Seeders registered by the modules that own catalogs (issue #18 registers the first one). The
 * list is empty until then.
 */
export const catalogSeeders: CatalogSeeder[] = [];

export function registerCatalogSeeder(seeder: CatalogSeeder): void {
  catalogSeeders.push(seeder);
}

export interface SeedCatalogsDeps {
  readonly withTransaction: WithTransaction;
  readonly seeders: readonly CatalogSeeder[];
}

/** Runs every seeder in one transaction with `app.tenant_id` bound to the tenant. */
export async function seedCatalogs(deps: SeedCatalogsDeps, tenant: SeededTenant): Promise<void> {
  if (deps.seeders.length === 0) return;
  await deps.withTransaction({ tenantId: tenant.tenantId, events: [] }, async (tx) => {
    for (const seeder of deps.seeders) await seeder(tx, tenant);
  });
}
