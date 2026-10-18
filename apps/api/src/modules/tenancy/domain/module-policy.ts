// ModulePolicy (ADR 0006): use cases ask whether a tenant module is on before accepting input
// that needs it. Reads the settings snapshot carried by the context, never the database.
import { DomainError, err, ok } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import type { ModuleName, TenantSettings } from './tenant';

export class ModuleDisabledError extends DomainError {
  readonly code = 'MODULE_DISABLED';
  readonly httpStatus = 403;
}

/** Anything that carries the settings snapshot of the current tenant (TenantContext does). */
export interface HasSettings {
  readonly settings: Pick<TenantSettings, 'modules'>;
}

export const ModulePolicy = {
  isEnabled(ctx: HasSettings, module: ModuleName): boolean {
    return ctx.settings.modules[module];
  },

  /** `err(ModuleDisabledError)` when the module is off for the tenant. */
  require(ctx: HasSettings, module: ModuleName): Result<void, ModuleDisabledError> {
    if (ModulePolicy.isEnabled(ctx, module)) return ok(undefined);
    return err(new ModuleDisabledError(`Module ${module} is disabled for this tenant`, { module }));
  },
} as const;
