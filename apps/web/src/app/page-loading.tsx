import { useTranslation } from 'react-i18next';

/** Default pending state of a route that is still loading. */
export function PageLoading() {
  const { t } = useTranslation('common');
  return (
    <p role="status" className="py-8 text-muted-foreground">
      {t('loading')}
    </p>
  );
}
