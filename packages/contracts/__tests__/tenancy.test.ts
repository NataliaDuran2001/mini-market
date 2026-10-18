import { describe, expect, it } from 'vitest';
import {
  createTenantInputSchema,
  tenantResponseSchema,
  tenantSettingsSchema,
  timezoneSchema,
  updateTenantSettingsSchema,
} from '../src/tenancy/index.js';

describe('tenancy contracts', () => {
  it('fills every default when settings are empty, so old rows keep parsing', () => {
    // AC-1 (defaults)
    expect(tenantSettingsSchema.parse({})).toEqual({
      vertical: 'generic',
      modules: { lots: false, fractional: false, credit_sales: false, custom_fields: false },
      allowNegativeStock: false,
      employeeCanVoid: false,
      timezone: 'America/La_Paz',
      currency: 'BOB',
    });
  });

  it('keeps stored flags and fills only the keys that are missing', () => {
    const parsed = tenantSettingsSchema.parse({
      vertical: 'farmacia',
      modules: { lots: true },
      allowNegativeStock: true,
    });
    expect(parsed.modules).toEqual({
      lots: true,
      fractional: false,
      credit_sales: false,
      custom_fields: false,
    });
    expect(parsed.allowNegativeStock).toBe(true);
    expect(parsed.vertical).toBe('farmacia');
  });

  it('rejects an unknown time zone with a field error and accepts real ones', () => {
    // AC-5
    const bad = tenantSettingsSchema.safeParse({ timezone: 'Mars/Base' });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0]?.path).toEqual(['timezone']);
    for (const zone of ['America/La_Paz', 'UTC', 'Europe/Madrid', 'Asia/Kolkata']) {
      expect(timezoneSchema.safeParse(zone).success, zone).toBe(true);
    }
    for (const zone of [
      '',
      'la paz',
      'America/Nowhere',
      'GMT+4',
      '+04:00',
      'Mars/Base',
      'america/la_paz',
      'America/la_paz',
    ]) {
      expect(timezoneSchema.safeParse(zone).success, zone).toBe(false);
    }
  });

  it('rejects unknown verticals, currencies and non-boolean flags', () => {
    // AC-5
    expect(tenantSettingsSchema.safeParse({ vertical: 'bookshop' }).success).toBe(false);
    expect(tenantSettingsSchema.safeParse({ currency: 'USD' }).success).toBe(false);
    expect(tenantSettingsSchema.safeParse({ allowNegativeStock: 'yes' }).success).toBe(false);
    expect(tenantSettingsSchema.safeParse({ modules: { lots: 1 } }).success).toBe(false);
  });

  it('accepts any subset as a patch and rejects unknown keys', () => {
    // AC-2, AC-5
    expect(updateTenantSettingsSchema.parse({})).toEqual({});
    expect(updateTenantSettingsSchema.parse({ allowNegativeStock: true })).toEqual({
      allowNegativeStock: true,
    });
    expect(updateTenantSettingsSchema.parse({ modules: { lots: true } })).toEqual({
      modules: { lots: true },
    });
    expect(updateTenantSettingsSchema.safeParse({ nope: true }).success).toBe(false);
    expect(updateTenantSettingsSchema.safeParse({ modules: { nope: true } }).success).toBe(false);
    expect(updateTenantSettingsSchema.safeParse({ timezone: 'Mars/Base' }).success).toBe(false);
  });

  it('validates the provisioning input', () => {
    expect(
      createTenantInputSchema.parse({
        name: '  Minimarket Sol ',
        slug: 'mm-sol',
        vertical: 'minimarket',
      }),
    ).toEqual({ name: 'Minimarket Sol', slug: 'mm-sol', vertical: 'minimarket' });
    for (const slug of [
      'ab',
      'Has-Caps',
      'two--hyphens',
      '-lead',
      'trail-',
      'a'.repeat(41),
      'sp ace',
    ]) {
      expect(
        createTenantInputSchema.safeParse({ name: 'x', slug, vertical: 'generic' }).success,
        slug,
      ).toBe(false);
    }
    expect(
      createTenantInputSchema.safeParse({ name: ' ', slug: 'abc', vertical: 'generic' }).success,
    ).toBe(false);
    expect(
      createTenantInputSchema.safeParse({ name: 'x', slug: 'abc', vertical: 'generic', extra: 1 })
        .success,
    ).toBe(false);
  });

  it('describes the tenant response', () => {
    const body = {
      id: '00000000-0000-0000-0000-000000000001',
      slug: 'mm-sol',
      name: 'Minimarket Sol',
      settings: tenantSettingsSchema.parse({}),
    };
    expect(tenantResponseSchema.parse(body)).toEqual(body);
    expect(tenantResponseSchema.safeParse({ ...body, id: 'x' }).success).toBe(false);
  });
});
