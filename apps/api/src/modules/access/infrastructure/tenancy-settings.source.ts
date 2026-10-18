import { presetFor } from '../../tenancy';
import type { GetTenantSettings, TenantScope, TenantSettings } from '../../tenancy';
import type { TenantSettingsSource } from '../application/ports/tenant-settings-source.port';
import type { Role } from '../domain/identity';

/**
 * Reads the settings snapshot through the public use case of tenancy. That use case takes a
 * caller scope but only looks at `tenantId`, so the scope built here carries a placeholder
 * settings value (the very thing being fetched). The caller was just verified as a member.
 */
export class TenancySettingsSource implements TenantSettingsSource {
  constructor(private readonly getTenantSettings: GetTenantSettings) {}

  async settingsOf(caller: {
    readonly tenantId: string;
    readonly userId: string;
    readonly role: Role;
  }): Promise<TenantSettings> {
    const provisional: TenantScope = { ...caller, settings: presetFor('generic'), events: [] };
    const view = await this.getTenantSettings(provisional);
    if (!view.ok) throw view.error;
    return view.value.settings;
  }
}
