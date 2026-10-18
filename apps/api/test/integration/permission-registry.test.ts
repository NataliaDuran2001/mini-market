import { describe, expect, it } from 'vitest';
import { PERMISSION_REGISTRY, grantedPermissions } from '../../src/modules/access';
import type { PermissionDefinitions, PermissionRegistry } from '../../src/modules/access';
import { useAccessApp } from '../access-fixture';

// Words that mark data an employee must never reach (docs/01-domain.md section 4: cost, profit,
// capital, expenses and everything built from them). Matched inside the words of the name, so
// `products.read_cost` and `costing.read` are caught as well as `costs.read`.
const SENSITIVE = [
  'cost',
  'profit',
  'margin',
  'capital',
  'equity',
  'expens',
  'payable',
  'report',
  'valuation',
  'purchase_price',
];

/** Permissions an employee holds, under either value of the setting that can change a grant. */
function sensitivePermissionsOfEmployee(definitions: PermissionDefinitions): string[] {
  const held = new Set<string>();
  for (const employeeCanVoid of [false, true]) {
    for (const name of grantedPermissions(definitions, 'employee', { employeeCanVoid })) {
      if (SENSITIVE.some((word) => name.includes(word))) held.add(name);
    }
  }
  return [...held].sort();
}

describe('the permission registry of the running application', () => {
  const ctx = useAccessApp();
  const registry = () => ctx.app().get<PermissionRegistry>(PERMISSION_REGISTRY);

  it('registers the permissions of the access module', () => {
    expect(Object.keys(registry().all())).toEqual(
      expect.arrayContaining(['members.manage', 'settings.write']),
    );
  });

  it('never grants an employee a permission on cost, profit, capital or expenses', () => {
    // Iterates every permission registered by every module of APP_MODULES, so a new module cannot
    // slip one in unnoticed (hard rule 7: employee DTOs never carry cost, profit or capital).
    expect(sensitivePermissionsOfEmployee(registry().all())).toEqual([]);
  });

  it('keeps manage and settings permissions with the owner', () => {
    const employee = grantedPermissions(registry().all(), 'employee', { employeeCanVoid: true });
    expect(employee).not.toContain('members.manage');
    expect(employee).not.toContain('settings.write');
  });
});

describe('the sensitive permission check itself', () => {
  it('catches an employee grant on cost, profit, capital or expenses, however it is spelled', () => {
    const definitions: PermissionDefinitions = {
      'costs.read': { owner: true, employee: true },
      'products.read_cost': { owner: true, employee: true },
      'costing.read': { owner: true, employee: true },
      'sales.margin': { owner: true, employee: (settings) => settings.employeeCanVoid },
      'equity.record': { owner: true, employee: true },
      'expenses.create': { owner: true, employee: true },
      'payables.pay': { owner: true, employee: true },
      'reports.read': { owner: true, employee: false },
      'sales.create': { owner: true, employee: true },
    };

    expect(sensitivePermissionsOfEmployee(definitions)).toEqual([
      'costing.read',
      'costs.read',
      'equity.record',
      'expenses.create',
      'payables.pay',
      'products.read_cost',
      'sales.margin',
    ]);
  });
});
