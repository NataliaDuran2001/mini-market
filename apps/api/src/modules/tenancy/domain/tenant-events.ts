// Domain events of the tenancy module (PascalCase, past tense; ADR 0014).
import type { TenantSettings, Vertical } from './tenant';

/**
 * A tenant was provisioned. The catalog module subscribes to seed the preset catalogs from
 * `vertical` (issue #18); the audit module records `tenant.provisioned`.
 */
export interface TenantCreated {
  readonly type: 'TenantCreated';
  readonly tenantId: string;
  readonly slug: string;
  readonly vertical: Vertical;
  readonly settings: TenantSettings;
  readonly occurredAt: Date;
}

/** Settings changed; the audit module records `tenant.settings_changed` with before and after. */
export interface TenantSettingsChanged {
  readonly type: 'TenantSettingsChanged';
  readonly tenantId: string;
  readonly userId: string;
  readonly before: TenantSettings;
  readonly after: TenantSettings;
  readonly occurredAt: Date;
}

export type TenancyEvent = TenantCreated | TenantSettingsChanged;
