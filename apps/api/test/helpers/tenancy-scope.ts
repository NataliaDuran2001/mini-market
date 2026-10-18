import { ACCESS_PERMISSIONS, TenantContext, grantedPermissions } from '../../src/modules/access';
import { presetFor } from '../../src/modules/tenancy';
import type { TenantScope, TenantSettings, Vertical } from '../../src/modules/tenancy';

/**
 * A caller scope for tenancy tests: a real TenantContext whose permissions come from the matrix.
 * `settings` replaces the whole preset; use `asOwner` and `asEmployee` for a patch instead.
 */
export function aScope(
  tenantId: string,
  role: 'owner' | 'employee',
  options: { readonly vertical?: Vertical; readonly settings?: TenantSettings } = {},
): TenantScope {
  const settings = options.settings ?? presetFor(options.vertical ?? 'minimarket');
  return new TenantContext({
    tenantId,
    userId: `${role}-of-${tenantId}`,
    role,
    settings,
    permissions: grantedPermissions(ACCESS_PERMISSIONS, role, settings),
  });
}
