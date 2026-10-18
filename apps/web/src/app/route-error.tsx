import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { Button } from '@/ui/button';

/** Spanish fallback for any route that fails to load (network, server error), never a blank page. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const { t, i18n } = useTranslation('common');
  const router = useRouter();
  return (
    <section className="grid justify-items-start gap-3 py-8" role="alert">
      <h1 className="text-2xl font-semibold">{t('routeError.title')}</h1>
      <p className="text-muted-foreground">{apiErrorMessage(i18n, error)}</p>
      <Button
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        {t('routeError.retry')}
      </Button>
    </section>
  );
}
