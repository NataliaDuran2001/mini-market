import {
  VERTICALS as CONTRACT_VERTICALS,
  tenantSettingsSchema,
} from '@mini-market/contracts/tenancy';
import { describe, expect, it } from 'vitest';
import { ModuleDisabledError, ModulePolicy } from './module-policy';
import { presetFor } from './presets';
import { applySettingsPatch, VERTICALS } from './tenant';

describe('presets', () => {
  it('farmacia turns lots, fractional and credit_sales on with La Paz and BOB', () => {
    // AC-1
    const settings = presetFor('farmacia');
    expect(settings.vertical).toBe('farmacia');
    expect(settings.modules).toEqual({
      lots: true,
      fractional: true,
      credit_sales: true,
      custom_fields: false,
    });
    expect(settings.timezone).toBe('America/La_Paz');
    expect(settings.currency).toBe('BOB');
  });

  it('minimarket has only credit_sales on and generic has everything off', () => {
    // AC-1
    expect(presetFor('minimarket').modules).toEqual({
      lots: false,
      fractional: false,
      credit_sales: true,
      custom_fields: false,
    });
    expect(Object.values(presetFor('generic').modules).every((flag) => !flag)).toBe(true);
  });

  it.each(VERTICALS)(
    '%s preset is valid for the contracts schema and keeps the defaults of S13',
    (vertical) => {
      // AC-1, AC-5 (the domain types and the Zod schema cannot drift apart)
      const preset = presetFor(vertical);
      expect(tenantSettingsSchema.parse(preset)).toEqual(preset);
      expect(preset.allowNegativeStock).toBe(false);
      expect(preset.employeeCanVoid).toBe(false);
    },
  );

  it('lists the same verticals as the contracts schema', () => {
    // AC-1 (the domain cannot import contracts, so a test keeps both lists equal)
    expect([...VERTICALS]).toEqual([...CONTRACT_VERTICALS]);
  });

  it('hands out a copy: changing it does not change the preset', () => {
    const copy = presetFor('generic');
    (copy.modules as { lots: boolean }).lots = true; // test-only cast: modules are readonly
    expect(presetFor('generic').modules.lots).toBe(false);
  });
});

describe('applySettingsPatch', () => {
  it('changes only the keys in the patch and leaves modules flags it does not mention', () => {
    // AC-2
    const current = presetFor('minimarket');
    const next = applySettingsPatch(current, { allowNegativeStock: true });
    expect(next).toEqual({ ...current, allowNegativeStock: true });
    const merged = applySettingsPatch(current, { modules: { lots: true } });
    expect(merged.modules).toEqual({ ...current.modules, lots: true });
    expect(merged.vertical).toBe('minimarket');
  });

  it('applies every key it supports and does not mutate the input', () => {
    // AC-2
    const current = presetFor('generic');
    const next = applySettingsPatch(current, {
      vertical: 'farmacia',
      modules: { credit_sales: true, custom_fields: true, fractional: true, lots: true },
      allowNegativeStock: true,
      employeeCanVoid: true,
      timezone: 'America/Lima',
      currency: 'BOB',
    });
    expect(next).toEqual({
      vertical: 'farmacia',
      modules: { lots: true, fractional: true, credit_sales: true, custom_fields: true },
      allowNegativeStock: true,
      employeeCanVoid: true,
      timezone: 'America/Lima',
      currency: 'BOB',
    });
    expect(current).toEqual(presetFor('generic'));
  });

  it('treats an explicit undefined as "not mentioned"', () => {
    const current = presetFor('minimarket');
    expect(
      applySettingsPatch(current, { employeeCanVoid: undefined, modules: { lots: undefined } }),
    ).toEqual(current);
  });
});

describe('ModulePolicy', () => {
  it('returns err(ModuleDisabled) when the module is off', () => {
    // AC-4
    const ctx = { settings: presetFor('generic') };
    const result = ModulePolicy.require(ctx, 'credit_sales');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ModuleDisabledError);
    expect(result.error.code).toBe('MODULE_DISABLED');
    expect(result.error.httpStatus).toBe(403);
    expect(result.error.details).toEqual({ module: 'credit_sales' });
    expect(ModulePolicy.isEnabled(ctx, 'credit_sales')).toBe(false);
  });

  it('returns ok when the module is on', () => {
    // AC-4
    const ctx = { settings: presetFor('minimarket') };
    expect(ModulePolicy.require(ctx, 'credit_sales').ok).toBe(true);
    expect(ModulePolicy.isEnabled(ctx, 'credit_sales')).toBe(true);
    expect(ModulePolicy.require(ctx, 'lots').ok).toBe(false);
  });

  it('answers per module for the same tenant', () => {
    // AC-4
    const ctx = { settings: presetFor('farmacia') };
    expect(ModulePolicy.isEnabled(ctx, 'lots')).toBe(true);
    expect(ModulePolicy.isEnabled(ctx, 'custom_fields')).toBe(false);
  });
});
