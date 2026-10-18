// Domain Nest modules, one import per line and one entry per line, sorted alphabetically.
// Lanes add their module here; on a merge conflict keep both sides in alphabetical order.
import { HealthModule } from './modules/health/health.module';

// prettier-ignore
export const APP_MODULES = [
  HealthModule,
];
