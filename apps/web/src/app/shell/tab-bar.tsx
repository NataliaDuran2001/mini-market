import { Ellipsis } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/ui/sheet';
import { NavLink } from './nav-link';

const TAB_CLASS =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 border-t-2 border-transparent px-1 py-2 text-xs font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring';
// Not colour alone: the active tab also gets a top border and heavier text.
const TAB_ACTIVE_CLASS = 'border-foreground font-semibold text-foreground';

function MoreSheet({ items }: { items: readonly NavigationItem[] }) {
  const { t } = useTranslation('shell');
  return (
    <Sheet>
      <SheetTrigger className={TAB_CLASS}>
        <Ellipsis aria-hidden className="size-5" />
        <span>{t('nav.more')}</span>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t('nav.more')}</SheetTitle>
          <SheetDescription className="sr-only">{t('nav.moreDescription')}</SheetDescription>
        </SheetHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('nav.moreEmpty')}</p>
        ) : (
          <ul className="grid gap-1">
            {items.map((item) => (
              <li key={item.id}>
                <SheetClose asChild>
                  <NavLink
                    item={item}
                    className="flex min-h-12 items-center gap-3 rounded-md px-2 text-base"
                    activeClassName="bg-accent"
                  />
                </SheetClose>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Mobile navigation: a bar fixed to the bottom of the screen, within thumb reach, with the
 * primary sections and a "Más" sheet for the rest. Hidden from 1024px, where the sidebar shows.
 */
export function TabBar({
  tabs,
  more,
}: {
  tabs: readonly NavigationItem[];
  more: readonly NavigationItem[];
}) {
  const { t } = useTranslation('shell');
  return (
    <nav
      aria-label={t('nav.primary')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {tabs.map((item) => (
          <li key={item.id} className="flex flex-1">
            <NavLink item={item} className={TAB_CLASS} activeClassName={TAB_ACTIVE_CLASS} />
          </li>
        ))}
        <li className="flex flex-1">
          <MoreSheet items={more} />
        </li>
      </ul>
    </nav>
  );
}
