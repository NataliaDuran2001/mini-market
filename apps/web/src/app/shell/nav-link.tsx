import { Link } from '@tanstack/react-router';
import type { MouseEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { translateKey } from '@/lib/i18n/translate-key';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { cn } from '@/lib/utils';

/** Label of a navigation entry, from its i18n key. */
export function useNavigationLabel(item: NavigationItem): string {
  const { t, i18n } = useTranslation('shell');
  return translateKey(i18n, item.labelKey, t('nav.unnamed'));
}

/**
 * Link of a navigation entry. Registry paths are plain strings because the route files belong to
 * the features that register them, so the typed router `to` is satisfied with one cast, here.
 */
export function NavLink({
  item,
  className,
  activeClassName,
  onNavigate,
  onClick,
}: {
  item: NavigationItem;
  className?: string;
  activeClassName?: string;
  onNavigate?: () => void;
  /** Also what `<SheetClose asChild>` injects, so choosing a section closes the sheet it is in. */
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const label = useNavigationLabel(item);
  const Icon = item.icon;
  return (
    <Link
      // as: the registry holds string paths; the route for each is registered by its own feature.
      to={item.path as '/'}
      onClick={(event) => {
        onClick?.(event);
        onNavigate?.();
      }}
      className={cn(className)}
      activeProps={{ 'aria-current': 'page', className: cn(className, activeClassName) }}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
