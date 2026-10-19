import { Settings } from 'lucide-react';
import type { NavigationItem } from '@/lib/navigation/navigation-item';

// Takes over the default `settings` entry of the shell (same id) now that the screen exists.
// Owner only: `settings.write` is held by nobody else (docs/01-domain.md section 4).
export const navigation: readonly NavigationItem[] = [
  {
    id: 'settings',
    path: '/settings',
    labelKey: 'settings:nav.title',
    icon: Settings,
    placement: 'more',
    order: 80,
    permission: 'settings.write',
  },
];
