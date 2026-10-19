// Public API of the tenancy module: the only file other modules may import.
export { catalogSeeders, registerCatalogSeeder, seedCatalogs } from './application/catalog-seeders';
export type { CatalogSeeder, SeededTenant } from './application/catalog-seeders';
export { CREATE_TENANT, createTenant } from './application/create-tenant';
export type { CreateTenant } from './application/create-tenant';
export { GET_TENANT_SETTINGS } from './application/get-tenant-settings';
export type { GetTenantSettings } from './application/get-tenant-settings';
export { UPDATE_TENANT_SETTINGS } from './application/update-tenant-settings';
export type { UpdateTenantSettings } from './application/update-tenant-settings';
export type { TenantRepository } from './application/ports/tenant.repository';
export type { TenantScope } from './application/tenant-scope';
export type { TenantView } from './application/tenant-view';
export { ModuleDisabledError, ModulePolicy } from './domain/module-policy';
export type { HasSettings } from './domain/module-policy';
export { presetFor } from './domain/presets';
export { applySettingsPatch, MODULE_NAMES, VERTICALS } from './domain/tenant';
export type {
  ModuleName,
  Tenant,
  TenantModules,
  TenantSettings,
  TenantSettingsPatch,
  Vertical,
} from './domain/tenant';
export type { TenancyEvent, TenantCreated, TenantSettingsChanged } from './domain/tenant-events';
export { tenants } from './infrastructure/schema';
export { createTenantRepository } from './infrastructure/tenant.repository';
export { TenancyModule } from './tenancy.module';
