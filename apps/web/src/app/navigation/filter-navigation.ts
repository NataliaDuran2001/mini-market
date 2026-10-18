import type { NavigationItem, TenantModule } from '@/lib/navigation/navigation-item';

export interface NavigationAccess {
  /** `can(permission)` of the current person in the current business. */
  readonly can: (permission: string) => boolean;
  /** `settings.modules` of the tenant; undefined while it is loading (module entries stay hidden). */
  readonly modules: Readonly<Partial<Record<TenantModule, boolean>>> | undefined;
}

/**
 * What the person may see: entries need their permission and, when they belong to a module, the
 * module switched on for the tenant (ADR 0006). The API enforces both again.
 */
export function filterNavigation(
  items: readonly NavigationItem[],
  access: NavigationAccess,
): readonly NavigationItem[] {
  return items.filter((item) => {
    if (item.permission && !access.can(item.permission)) return false;
    if (item.module && access.modules?.[item.module] !== true) return false;
    return true;
  });
}
