import { describe, expect, it } from 'vitest';
import { can } from './role-permissions';

describe('can', () => {
  it('gives the owner every permission, known or not', () => {
    // AC-4
    expect(can('owner', 'reports.read')).toBe(true);
    expect(can('owner', 'anything.new')).toBe(true);
  });

  it('denies an employee the owner-only permissions', () => {
    // AC-4 (docs/01-domain.md section 4: reports, capital, settings, costs, expenses)
    for (const permission of [
      'reports.read',
      'equity.read',
      'settings.write',
      'members.manage',
      'costs.read',
      'inventory.adjust',
    ]) {
      expect(can('employee', permission), permission).toBe(false);
    }
  });

  it('lets an employee sell and register purchases', () => {
    expect(can('employee', 'sales.create')).toBe(true);
    expect(can('employee', 'purchases.create')).toBe(true);
  });

  it('lets an employee void only when the tenant allows it', () => {
    expect(can('employee', 'sales.void')).toBe(false);
    expect(can('employee', 'sales.void', { employeeCanVoid: true })).toBe(true);
  });

  it('fails closed for an unknown permission or an unknown role', () => {
    expect(can('employee', 'something.new')).toBe(false);
    expect(can(null, 'sales.create')).toBe(false);
  });
});
