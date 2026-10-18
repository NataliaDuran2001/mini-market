import type { TenantSettings } from '../../../tenancy';
import type { Role } from '../../domain/identity';

/** Reads the settings of the tenant of a caller whose membership has just been verified. */
export interface TenantSettingsSource {
  /** @throws when the tenant row is missing or its settings are invalid: both are data bugs. */
  settingsOf(caller: {
    readonly tenantId: string;
    readonly userId: string;
    readonly role: Role;
  }): Promise<TenantSettings>;
}
