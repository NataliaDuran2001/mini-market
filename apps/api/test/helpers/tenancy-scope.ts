import { presetFor } from '../../src/modules/tenancy';
import type { TenantScope, TenantSettings, Vertical } from '../../src/modules/tenancy';

/** A caller scope for tenancy tests. Issue #11 adds the full TenantContext helpers (asOwner...). */
export function aScope(
  tenantId: string,
  role: 'owner' | 'employee',
  options: { readonly vertical?: Vertical; readonly settings?: TenantSettings } = {},
): TenantScope {
  return {
    tenantId,
    userId: `${role}-of-${tenantId}`,
    role,
    settings: options.settings ?? presetFor(options.vertical ?? 'minimarket'),
    events: [],
  };
}
