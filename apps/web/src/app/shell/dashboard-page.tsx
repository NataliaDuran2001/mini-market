import { useTranslation } from 'react-i18next';
import { HomePage } from '@/features/home';
import { useNavigation } from '../navigation/use-navigation';
import { NavLink } from './nav-link';

/**
 * Empty-state dashboard at `/`: a welcome, the server status of the skeleton, and shortcuts to
 * every section the person may use (they lead to each screen as its feature arrives).
 */
export function DashboardPage() {
  const { t } = useTranslation('shell');
  const { all } = useNavigation();
  return (
    <div className="grid gap-4">
      <HomePage />
      <section aria-labelledby="shortcuts-title" className="grid gap-3">
        <h2 id="shortcuts-title" className="text-lg font-semibold">
          {t('dashboard.shortcuts')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('dashboard.empty')}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {all.map((item) => (
            <li key={item.id}>
              <NavLink
                item={item}
                className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-xl border bg-card p-3 text-sm font-medium shadow-sm hover:bg-accent"
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
