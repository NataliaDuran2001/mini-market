import { err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { Result, ValidationError } from '@mini-market/shared-kernel';
import { parseSettings } from './parse-settings';
import type { TenantRepository } from './ports/tenant.repository';
import type { TenantScope } from './tenant-scope';
import type { TenantView } from './tenant-view';

export interface GetTenantSettingsDeps {
  readonly tenants: TenantRepository;
}

export type GetTenantSettings = (
  ctx: TenantScope,
) => Promise<Result<TenantView, NotFoundError | ValidationError>>;

export const GET_TENANT_SETTINGS = Symbol('GET_TENANT_SETTINGS');

/** Any member of the tenant may read its name and settings: the web needs the module flags. */
export async function getTenantSettings(
  deps: GetTenantSettingsDeps,
  ctx: TenantScope,
): Promise<Result<TenantView, NotFoundError | ValidationError>> {
  const stored = await deps.tenants.findById(ctx);
  if (!stored) return err(new NotFoundError('Tenant not found', { tenantId: ctx.tenantId }));
  const settings = parseSettings(stored.settings);
  if (!settings.ok) return settings;
  return ok({ id: stored.id, slug: stored.slug, name: stored.name, settings: settings.value });
}
