import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';

/** Shown instead of a blank screen when a route needs a permission the person does not hold. */
export function ForbiddenPage() {
  const { t } = useTranslation('auth');
  return (
    <section className="grid justify-items-start gap-3 py-8">
      <h1 className="text-2xl font-semibold">{t('forbidden.title')}</h1>
      <p className="text-muted-foreground">{t('forbidden.description')}</p>
      <Button asChild>
        <Link to="/">{t('forbidden.backHome')}</Link>
      </Button>
    </section>
  );
}
