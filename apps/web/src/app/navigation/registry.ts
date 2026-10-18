import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { DEFAULT_NAVIGATION } from './default-items';

/**
 * Later sources win: a feature replaces the default entry that has the same `id`. The gates of the
 * default entry (`permission`, `module`) are kept when the replacement does not set its own, so
 * overriding an entry can never open an owner-only or disabled-module section by omission.
 */
export function mergeNavigation(
  ...sources: readonly (readonly NavigationItem[])[]
): readonly NavigationItem[] {
  const byId = new Map<string, NavigationItem>();
  for (const source of sources) {
    for (const item of source) {
      const previous = byId.get(item.id);
      const permission = item.permission ?? previous?.permission;
      const module = item.module ?? previous?.module;
      byId.set(item.id, {
        ...item,
        ...(permission !== undefined ? { permission } : {}),
        ...(module !== undefined ? { module } : {}),
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

// Each feature registers its entries in `src/features/<feature>/navigation.ts`
// (`export const navigation: readonly NavigationItem[] = [...]`). They are collected by glob, so no
// shared list is edited when a feature is added. docs/02-architecture.md section 6 lists this file
// as the one thing `app` reads from a feature besides `index.ts`; it holds plain data only.
const featureModules = import.meta.glob<{ navigation?: unknown }>(
  '../../features/*/navigation.ts',
  { eager: true },
);

/** A module whose export is missing or not a list is skipped, never allowed to blank the app. */
export function navigationOf(module: { navigation?: unknown }): readonly NavigationItem[] {
  // as: the export is declared `readonly NavigationItem[]` by contract; shape is checked just above.
  return Array.isArray(module.navigation) ? (module.navigation as NavigationItem[]) : [];
}

export const NAVIGATION: readonly NavigationItem[] = mergeNavigation(
  DEFAULT_NAVIGATION,
  ...Object.values(featureModules).map(navigationOf),
);
