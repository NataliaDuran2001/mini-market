import { Package, ShoppingCart } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { DEFAULT_NAVIGATION } from './default-items';
import { filterNavigation } from './filter-navigation';
import { mergeNavigation, NAVIGATION } from './registry';

const item = (overrides: Partial<NavigationItem> & { id: string }): NavigationItem => ({
  path: `/${overrides.id}`,
  labelKey: `shell:nav.${overrides.id}`,
  icon: Package,
  placement: 'more',
  order: 100,
  ...overrides,
});

const everything = { can: () => true, modules: { credit_sales: true } } as const;

describe('filterNavigation', () => {
  const items = [
    item({ id: 'open' }),
    item({ id: 'owner-only', permission: 'reports.read' }),
    item({ id: 'credit', module: 'credit_sales' }),
    item({ id: 'lots', module: 'lots' }),
  ];

  it('hides an entry whose module is off, and one whose permission is missing', () => {
    // AC-1, AC-2
    const visible = filterNavigation(items, {
      can: (permission) => permission !== 'reports.read',
      modules: { credit_sales: false, lots: true },
    }).map((entry) => entry.id);
    expect(visible).toEqual(['open', 'lots']);
  });

  it('shows everything the person may use', () => {
    // AC-1, AC-2
    const visible = filterNavigation(items, {
      can: () => true,
      modules: { credit_sales: true, lots: true },
    }).map((entry) => entry.id);
    expect(visible).toEqual(['open', 'owner-only', 'credit', 'lots']);
  });

  it('keeps module entries hidden while the tenant settings are loading', () => {
    // AC-1
    const visible = filterNavigation(items, { can: () => true, modules: undefined });
    expect(visible.map((entry) => entry.id)).toEqual(['open', 'owner-only']);
  });
});

describe('navigation registry', () => {
  it('lets a feature replace the default entry with the same id and keeps the order', () => {
    const replacement = item({
      id: 'sales',
      path: '/pos',
      icon: ShoppingCart,
      placement: 'tab',
      order: 5,
    });
    const merged = mergeNavigation(DEFAULT_NAVIGATION, [replacement]);
    expect(merged[0]).toBe(replacement);
    expect(merged.filter((entry) => entry.id === 'sales')).toHaveLength(1);
    expect(merged).toHaveLength(DEFAULT_NAVIGATION.length);
  });

  it('ships the sections of the product, each with a Spanish label key', () => {
    expect(NAVIGATION.map((entry) => entry.id)).toEqual([
      'sales',
      'products',
      'purchases',
      'customers',
      'expenses',
      'reports',
      'capital',
      'settings',
    ]);
    expect(NAVIGATION.every((entry) => entry.labelKey.startsWith('shell:nav.'))).toBe(true);
  });

  it('puts three primary sections on the mobile tab bar', () => {
    expect(NAVIGATION.filter((entry) => entry.placement === 'tab').map((e) => e.id)).toEqual([
      'sales',
      'products',
      'purchases',
    ]);
  });

  it('gates the owner-only sections with a permission and credit sales with its module', () => {
    const byId = Object.fromEntries(NAVIGATION.map((entry) => [entry.id, entry]));
    expect(byId['reports']?.permission).toBeDefined();
    expect(byId['capital']?.permission).toBeDefined();
    expect(byId['settings']?.permission).toBeDefined();
    expect(byId['customers']?.module).toBe('credit_sales');
    expect(filterNavigation(NAVIGATION, everything)).toHaveLength(NAVIGATION.length);
  });
});
