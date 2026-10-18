// Tenancy contracts (issue #10). Import as `@mini-market/contracts/tenancy`.
import { z } from 'zod';
import { uuidSchema } from '../common/index.js';

export const VERTICALS = ['minimarket', 'farmacia', 'generic'] as const;
export const DEFAULT_TIMEZONE = 'America/La_Paz';
export const DEFAULT_CURRENCY = 'BOB';

/**
 * True for "UTC" and for Area/Location names the runtime accepts. Intl.supportedValuesOf is not
 * used on purpose: it lists canonical names only, so it rejects valid aliases such as Asia/Kolkata
 * (canonical Asia/Calcutta). Offsets like "+04:00" are rejected: a tenant zone is an IANA name.
 */
function isIanaTimeZone(value: string): boolean {
  if (value !== 'UTC' && !/^[A-Z][A-Za-z_]*(\/[A-Z][A-Za-z0-9_+-]*)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** An IANA zone the runtime knows, so Period never throws on a stored tenant zone. */
export const timezoneSchema = z.string().refine(isIanaTimeZone, 'Unknown IANA time zone');

export const verticalSchema = z.enum(VERTICALS);

const modulesShape = {
  lots: z.boolean(),
  fractional: z.boolean(),
  credit_sales: z.boolean(),
  custom_fields: z.boolean(),
};

/**
 * Settings as stored and returned (docs/01-domain.md section 5). Every key has a default so a row
 * written before a key existed still parses: adding a key later is backward compatible.
 */
export const tenantSettingsSchema = z.object({
  vertical: verticalSchema.default('generic'),
  modules: z
    .object({
      lots: modulesShape.lots.default(false),
      fractional: modulesShape.fractional.default(false),
      credit_sales: modulesShape.credit_sales.default(false),
      custom_fields: modulesShape.custom_fields.default(false),
    })
    .prefault({}),
  allowNegativeStock: z.boolean().default(false),
  employeeCanVoid: z.boolean().default(false),
  timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  currency: z.enum([DEFAULT_CURRENCY]).default(DEFAULT_CURRENCY),
});

/** PATCH /tenant/settings body: any subset, unknown keys rejected, `modules` merges per flag. */
export const updateTenantSettingsSchema = z.strictObject({
  vertical: verticalSchema.optional(),
  modules: z
    .strictObject({
      lots: modulesShape.lots.optional(),
      fractional: modulesShape.fractional.optional(),
      credit_sales: modulesShape.credit_sales.optional(),
      custom_fields: modulesShape.custom_fields.optional(),
    })
    .optional(),
  allowNegativeStock: z.boolean().optional(),
  employeeCanVoid: z.boolean().optional(),
  timezone: timezoneSchema.optional(),
  currency: z.enum([DEFAULT_CURRENCY]).optional(),
});

/** Provisioning input (operator script, no public sign-up). */
export const createTenantInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens only'),
  vertical: verticalSchema,
});

/** GET /tenant and PATCH /tenant/settings response. */
export const tenantResponseSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  settings: tenantSettingsSchema,
});

export type Vertical = z.infer<typeof verticalSchema>;
export type TenantSettingsData = z.infer<typeof tenantSettingsSchema>;
export type UpdateTenantSettingsInput = z.infer<typeof updateTenantSettingsSchema>;
export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;
export type TenantResponse = z.infer<typeof tenantResponseSchema>;
