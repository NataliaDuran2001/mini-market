// Tenant and its settings (docs/01-domain.md section 5, ADR 0006). Pure TypeScript.
// The Zod schema that validates these shapes lives in @mini-market/contracts/tenancy; the
// application layer checks that both stay compatible.

export const VERTICALS = ['minimarket', 'farmacia', 'generic'] as const;
export type Vertical = (typeof VERTICALS)[number];

export const MODULE_NAMES = ['lots', 'fractional', 'credit_sales', 'custom_fields'] as const;
export type ModuleName = (typeof MODULE_NAMES)[number];

export type TenantModules = { readonly [Name in ModuleName]: boolean };

export interface TenantSettings {
  readonly vertical: Vertical;
  readonly modules: TenantModules;
  /** S13: allow a sale to drive stock below zero. */
  readonly allowNegativeStock: boolean;
  readonly employeeCanVoid: boolean;
  /** IANA zone; periods and days are computed in it (ADR 0008). */
  readonly timezone: string;
  readonly currency: 'BOB';
}

/** A subset of the settings; `modules` merges flag by flag. */
export interface TenantSettingsPatch {
  readonly vertical?: Vertical | undefined;
  readonly modules?: { readonly [Name in ModuleName]?: boolean | undefined } | undefined;
  readonly allowNegativeStock?: boolean | undefined;
  readonly employeeCanVoid?: boolean | undefined;
  readonly timezone?: string | undefined;
  readonly currency?: 'BOB' | undefined;
}

export interface Tenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly settings: TenantSettings;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Keys the patch does not mention keep their current value, including flags inside `modules`. */
export function applySettingsPatch(
  current: TenantSettings,
  patch: TenantSettingsPatch,
): TenantSettings {
  const modules = { ...current.modules };
  for (const name of MODULE_NAMES) {
    const flag = patch.modules?.[name];
    if (flag !== undefined) modules[name] = flag;
  }
  return {
    vertical: patch.vertical ?? current.vertical,
    modules,
    allowNegativeStock: patch.allowNegativeStock ?? current.allowNegativeStock,
    employeeCanVoid: patch.employeeCanVoid ?? current.employeeCanVoid,
    timezone: patch.timezone ?? current.timezone,
    currency: patch.currency ?? current.currency,
  };
}
