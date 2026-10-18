import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { DEFAULT_NAVIGATION } from './default-items';

/** Later sources win: a feature replaces the default entry that has the same `id`. */
export function mergeNavigation(
  ...sources: readonly (readonly NavigationItem[])[]
): readonly NavigationItem[] {
  const byId = new Map<string, NavigationItem>();
  for (const source of sources) {
    for (const item of source) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

// Each feature registers its entries in `src/features/<feature>/navigation.ts`
// (`export const navigation: readonly NavigationItem[] = [...]`). They are collected by glob, so no
// shared list is edited when a feature is added. This is the one place outside a feature's
// `index.ts` that reads a feature file, and it only reads plain data.
const featureModules = import.meta.glob<{ navigation: readonly NavigationItem[] }>(
  '../../features/*/navigation.ts',
  { eager: true },
);

export const NAVIGATION: readonly NavigationItem[] = mergeNavigation(
  DEFAULT_NAVIGATION,
  ...Object.values(featureModules).map((module) => module.navigation),
);
