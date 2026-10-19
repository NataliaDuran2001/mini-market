// Domain Nest modules, one import per line and one entry per line, sorted alphabetically.
// Lanes add their module here; on a merge conflict keep both sides in alphabetical order.
import { AccessModule } from './modules/access/access.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EquityModule } from './modules/equity/equity.module';
import { HealthModule } from './modules/health/health.module';
import { PayablesModule } from './modules/payables/payables.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';

// prettier-ignore
export const APP_MODULES = [
  AccessModule,
  CatalogModule,
  EquityModule,
  HealthModule,
  PayablesModule,
  PurchasingModule,
  TenancyModule,
];
