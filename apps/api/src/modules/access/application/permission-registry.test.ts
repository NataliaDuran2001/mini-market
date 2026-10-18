import { describe, expect, it } from 'vitest';
import { PermissionRegistry, registerPermissions } from './permission-registry';

describe('PermissionRegistry', () => {
  it('collects the permissions of every module that registers', () => {
    const registry = new PermissionRegistry();
    registerPermissions(registry, 'sales', { 'sales.create': { owner: true, employee: true } });
    registerPermissions(registry, 'reporting', {
      'reports.read': { owner: true, employee: false },
    });

    expect(Object.keys(registry.all()).sort()).toEqual(['reports.read', 'sales.create']);
    expect(registry.get('reports.read')).toEqual({ owner: true, employee: false });
    expect(registry.moduleOf('sales.create')).toBe('sales');
    expect(registry.get('nothing.here')).toBeUndefined();
  });

  it('stops the application when a name is malformed', () => {
    const registry = new PermissionRegistry();
    expect(() =>
      registerPermissions(registry, 'sales', { 'Sales-Create': { owner: true, employee: true } }),
    ).toThrow(/must look like "area.action"/);
  });

  it('stops the application when two modules claim the same permission', () => {
    const registry = new PermissionRegistry();
    registerPermissions(registry, 'sales', { 'sales.void': { owner: true, employee: false } });
    expect(() =>
      registerPermissions(registry, 'reporting', { 'sales.void': { owner: true, employee: true } }),
    ).toThrow('declared by both sales and reporting');
  });

  it('accepts the same module registering again, so a restart in a test is harmless', () => {
    const registry = new PermissionRegistry();
    const definitions = { 'sales.create': { owner: true, employee: true } } as const;
    registerPermissions(registry, 'sales', definitions);
    expect(() => registerPermissions(registry, 'sales', definitions)).not.toThrow();
  });
});
