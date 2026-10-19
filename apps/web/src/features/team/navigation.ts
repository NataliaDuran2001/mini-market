import { UsersRound } from 'lucide-react';
import type { NavigationItem } from '@/lib/navigation/navigation-item';

// Plain data collected by the app shell (docs/02-architecture.md section 6). Owner only: the
// permission `members.manage` is held by nobody else (docs/01-domain.md section 4).
export const navigation: readonly NavigationItem[] = [
  {
    id: 'team',
    path: '/team',
    labelKey: 'team:nav.title',
    icon: UsersRound,
    placement: 'more',
    order: 75,
    permission: 'members.manage',
  },
];
