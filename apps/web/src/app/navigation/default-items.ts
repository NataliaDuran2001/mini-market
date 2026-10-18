import {
  Banknote,
  BarChart3,
  Package,
  Receipt,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Users,
} from 'lucide-react';
import type { NavigationItem } from '@/lib/navigation/navigation-item';

/**
 * Sections the product is going to have (docs/00-vision.md), so the menu is complete while the
 * features arrive. A feature takes over its entry by exporting an item with the same `id` from its
 * own `navigation.ts`; nothing here needs editing for that.
 *
 * Permission names follow `<area>.<action>`. An employee holds only the ones the API grants; an
 * unknown name is hidden from employees (fail closed, see features/auth/domain/role-permissions).
 */
export const DEFAULT_NAVIGATION: readonly NavigationItem[] = [
  {
    id: 'sales',
    path: '/sales',
    labelKey: 'shell:nav.sales',
    icon: ShoppingCart,
    placement: 'tab',
    order: 10,
    permission: 'sales.create',
  },
  {
    id: 'products',
    path: '/products',
    labelKey: 'shell:nav.products',
    icon: Package,
    placement: 'tab',
    order: 20,
  },
  {
    id: 'purchases',
    path: '/purchases',
    labelKey: 'shell:nav.purchases',
    icon: ShoppingBasket,
    placement: 'tab',
    order: 30,
    permission: 'purchases.create',
  },
  {
    id: 'customers',
    path: '/customers',
    labelKey: 'shell:nav.customers',
    icon: Users,
    placement: 'more',
    order: 40,
    module: 'credit_sales',
  },
  {
    id: 'expenses',
    path: '/expenses',
    labelKey: 'shell:nav.expenses',
    icon: Receipt,
    placement: 'more',
    order: 50,
    permission: 'expenses.read',
  },
  {
    id: 'reports',
    path: '/reports',
    labelKey: 'shell:nav.reports',
    icon: BarChart3,
    placement: 'more',
    order: 60,
    permission: 'reports.read',
  },
  {
    id: 'capital',
    path: '/capital',
    labelKey: 'shell:nav.capital',
    icon: Banknote,
    placement: 'more',
    order: 70,
    permission: 'equity.read',
  },
  {
    id: 'settings',
    path: '/settings',
    labelKey: 'shell:nav.settings',
    icon: Settings,
    placement: 'more',
    order: 80,
    permission: 'settings.write',
  },
];
