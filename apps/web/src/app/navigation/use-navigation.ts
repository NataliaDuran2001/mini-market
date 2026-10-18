import { usePermissionCheck } from '@/features/auth';
import { useTenant } from '@/features/tenancy';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { filterNavigation } from './filter-navigation';
import { NAVIGATION } from './registry';

export interface VisibleNavigation {
  readonly all: readonly NavigationItem[];
  readonly tabs: readonly NavigationItem[];
  readonly more: readonly NavigationItem[];
}

/** The menu for the current person and business. */
export function useNavigation(items: readonly NavigationItem[] = NAVIGATION): VisibleNavigation {
  const can = usePermissionCheck();
  const tenant = useTenant();
  const all = filterNavigation(items, { can, modules: tenant.data?.settings.modules });
  return {
    all,
    tabs: all.filter((item) => item.placement === 'tab'),
    more: all.filter((item) => item.placement === 'more'),
  };
}
