import { describe, expect, it } from 'vitest';
import { grantedPermissions, isGranted, isValidPermissionName } from './permissions';
import type { PermissionDefinitions } from './permissions';

const definitions: PermissionDefinitions = {
  'sales.create': { owner: true, employee: true },
  'sales.void': { owner: true, employee: (settings) => settings.employeeCanVoid },
  'reports.read': { owner: true, employee: false },
  'members.manage': { owner: true, employee: false },
};

describe('permission matrix evaluation', () => {
  it('grants the owner everything', () => {
    // docs/01-domain.md section 4
    expect(grantedPermissions(definitions, 'owner', { employeeCanVoid: false })).toEqual([
      'members.manage',
      'reports.read',
      'sales.create',
      'sales.void',
    ]);
  });

  it('grants an employee only what the matrix grants, and sales.void only when employeeCanVoid is on', () => {
    // AC-2, AC-3
    expect(grantedPermissions(definitions, 'employee', { employeeCanVoid: false })).toEqual([
      'sales.create',
    ]);
    expect(grantedPermissions(definitions, 'employee', { employeeCanVoid: true })).toEqual([
      'sales.create',
      'sales.void',
    ]);
  });

  it('evaluates a single definition', () => {
    const voidRule = definitions['sales.void'];
    if (!voidRule) throw new Error('fixture missing');
    expect(isGranted(voidRule, 'employee', { employeeCanVoid: true })).toBe(true);
    expect(isGranted(voidRule, 'employee', { employeeCanVoid: false })).toBe(false);
    expect(isGranted(voidRule, 'owner', { employeeCanVoid: false })).toBe(true);
  });

  it('accepts "area.action" names only', () => {
    for (const valid of ['sales.void', 'equity.record', 'stock_levels.read']) {
      expect(isValidPermissionName(valid), valid).toBe(true);
    }
    for (const invalid of [
      'sales',
      'Sales.void',
      'sales.',
      '.void',
      'sales.void.all',
      'sales void',
    ]) {
      expect(isValidPermissionName(invalid), invalid).toBe(false);
    }
  });
});
