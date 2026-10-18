import { useTranslation } from 'react-i18next';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { NavLink } from './nav-link';

/** Desktop navigation (from 1024px): every section the person may see. */
export function Sidebar({ items }: { items: readonly NavigationItem[] }) {
  const { t } = useTranslation('shell');
  return (
    <aside className="hidden lg:block">
      <nav aria-label={t('nav.secondary')} className="sticky top-4">
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <NavLink
                item={item}
                className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent"
                activeClassName="bg-accent text-foreground"
              />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
