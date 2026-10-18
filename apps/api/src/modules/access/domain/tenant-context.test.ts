import { describe, expect, it } from 'vitest';
import { TenantContext } from './tenant-context';

const settings = {
  vertical: 'minimarket',
  modules: { lots: false, fractional: false, credit_sales: true, custom_fields: false },
  allowNegativeStock: false,
  employeeCanVoid: false,
  timezone: 'America/La_Paz',
  currency: 'BOB',
} as const;

const aContext = (permissions: readonly string[]) =>
  new TenantContext({
    tenantId: '00000000-0000-0000-0000-0000000000a1',
    userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    role: 'employee',
    settings,
    permissions,
  });

describe('TenantContext', () => {
  it('can() is true for a granted permission and false for the rest', () => {
    const ctx = aContext(['sales.create']);
    expect(ctx.can('sales.create')).toBe(true);
    expect(ctx.can('sales.void')).toBe(false);
  });

  it('denies a permission nobody declared, so a typo cannot open a door', () => {
    expect(aContext(['sales.create']).can('sales.creat')).toBe(false);
  });

  it('exposes who is acting and the settings snapshot', () => {
    const ctx = aContext([]);
    expect(ctx).toMatchObject({ role: 'employee', settings: { employeeCanVoid: false } });
  });

  it('queues events for after the commit, per context', () => {
    // ADR 0014
    const ctx = aContext([]);
    const other = aContext([]);
    ctx.publishAfterCommit({ type: 'SaleConfirmed' });
    expect(ctx.events).toEqual([{ type: 'SaleConfirmed' }]);
    expect(other.events).toEqual([]);
  });
});
