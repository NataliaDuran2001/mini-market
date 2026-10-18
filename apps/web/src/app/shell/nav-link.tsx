import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { translateKey } from '@/lib/i18n/translate-key';
import type { NavigationItem } from '@/lib/navigation/navigation-item';
import { cn } from '@/lib/utils';

/** Label of a navigation entry, from its i18n key. */
export function useNavigationLabel(item: NavigationItem): string {
  const { i18n } = useTranslation();
  return translateKey(i18n, item.labelKey, item.id);
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
}: {
  item: NavigationItem;
  className?: string;
  activeClassName?: string;
  onNavigate?: () => void;
}) {
  const label = useNavigationLabel(item);
  const Icon = item.icon;
  return (
    <Link
      // as: the registry holds string paths; the route for each is registered by its own feature.
      to={item.path as '/'}
      onClick={onNavigate}
      className={cn(className)}
      activeProps={{ 'aria-current': 'page', className: cn(className, activeClassName) }}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}
