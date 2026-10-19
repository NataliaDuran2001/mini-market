import type { Clock } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import type { Vertical } from '../../tenancy';
import { presetCatalogsFor } from '../domain/presets';
import type { CatalogRepository } from './ports/catalog.repository';

export interface SeedPresetCatalogsDeps {
  readonly catalogs: CatalogRepository;
  readonly clock: Clock;
}

/** The tenant a seeder fills, as provisioning describes it (`SeededTenant` of tenancy). */
export interface PresetTenant {
  readonly tenantId: string;
  readonly preset: Vertical;
}

/**
 * Gives a new tenant the catalogs of its vertical preset (issue #18). Runs inside the
 * provisioning transaction, which is bound to the tenant; running it again adds nothing, so a
 * repeated provisioning never duplicates rows.
 */
export async function seedPresetCatalogs(
  deps: SeedPresetCatalogsDeps,
  tx: Transaction,
  tenant: PresetTenant,
): Promise<void> {
  await deps.catalogs.seed(tx, tenant.tenantId, presetCatalogsFor(tenant.preset), deps.clock.now());
}
