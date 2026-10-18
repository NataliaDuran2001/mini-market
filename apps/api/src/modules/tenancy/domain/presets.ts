// Vertical presets (ADR 0006, docs/01-domain.md section 5). A preset only seeds the settings at
// provisioning time; after that every flag is editable per tenant.
import type { TenantSettings, Vertical } from './tenant';

const BASE = {
  allowNegativeStock: false,
  employeeCanVoid: false,
  timezone: 'America/La_Paz',
  currency: 'BOB',
} as const;

const ALL_OFF = { lots: false, fractional: false, credit_sales: false, custom_fields: false };

const PRESETS: { readonly [V in Vertical]: TenantSettings } = {
  minimarket: { ...BASE, vertical: 'minimarket', modules: { ...ALL_OFF, credit_sales: true } },
  farmacia: {
    ...BASE,
    vertical: 'farmacia',
    modules: { ...ALL_OFF, lots: true, fractional: true, credit_sales: true },
  },
  generic: { ...BASE, vertical: 'generic', modules: ALL_OFF },
};

/** Fresh copy of the preset settings for `vertical`, safe for the caller to keep. */
export function presetFor(vertical: Vertical): TenantSettings {
  const preset = PRESETS[vertical];
  return { ...preset, modules: { ...preset.modules } };
}
