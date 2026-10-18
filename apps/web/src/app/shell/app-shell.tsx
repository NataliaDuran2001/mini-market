import { Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '../navigation/use-navigation';
import { ShellHeader } from './shell-header';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';

/**
 * Frame of every signed-in screen. Phone first: header on top, content, tab bar fixed at the
 * bottom. From 1024px the tab bar becomes a sidebar. Features plug a route in under
 * `src/routes/_authenticated/` and an entry in their `navigation.ts`.
 */
export function AppShell() {
  const { t } = useTranslation('shell');
  const navigation = useNavigation();
  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        {t('nav.skipToContent')}
      </a>
      <Sidebar items={navigation.all} />
      {/* bottom padding keeps the content clear of the fixed tab bar on phones */}
      <div className="min-w-0 pb-20 lg:pb-4">
        <ShellHeader />
        <div id="main-content" tabIndex={-1} className="outline-none">
          <Outlet />
        </div>
      </div>
      <TabBar tabs={navigation.tabs} more={navigation.more} />
    </div>
  );
}
