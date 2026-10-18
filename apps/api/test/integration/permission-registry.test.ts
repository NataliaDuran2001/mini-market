import { describe, expect, it } from 'vitest';
import { PERMISSION_REGISTRY, grantedPermissions } from '../../src/modules/access';
import type { PermissionRegistry } from '../../src/modules/access';
import { useAccessApp } from '../access-fixture';

// Words that mark data an employee must never reach (docs/01-domain.md section 4: cost, profit,
// capital, expenses and everything built from them).
const SENSITIVE = new Set([
  'cost',
  'costs',
  'profit',
  'capital',
  'equity',
  'expense',
  'expenses',
  'payable',
  'payables',
  'report',
  'reports',
]);

describe('the permission registry of the running application', () => {
  const ctx = useAccessApp();
  const registry = () => ctx.app().get<PermissionRegistry>(PERMISSION_REGISTRY);

  it('registers the permissions of the access module', () => {
    expect(Object.keys(registry().all())).toEqual(
      expect.arrayContaining(['members.manage', 'settings.write']),
    );
  });

  it('never grants an employee a permission on cost, profit, capital or expenses', () => {
    // Iterates every permission registered by every module of APP_MODULES, under both settings
    // that can change an employee grant, so a new module cannot slip one in unnoticed.
    const definitions = registry().all();
    for (const employeeCanVoid of [false, true]) {
      for (const name of grantedPermissions(definitions, 'employee', { employeeCanVoid })) {
        const sensitive = name.split('.').filter((word) => SENSITIVE.has(word));
        expect(
          sensitive,
          `employee holds ${name} (employeeCanVoid=${String(employeeCanVoid)})`,
        ).toEqual([]);
      }
    }
  });

  it('keeps manage and settings permissions with the owner', () => {
    const employee = grantedPermissions(registry().all(), 'employee', { employeeCanVoid: true });
    expect(employee).not.toContain('members.manage');
    expect(employee).not.toContain('settings.write');
  });
});
