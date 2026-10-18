import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { useApiHealth } from '../api/use-api-health';

// Welcome and server status of the dashboard (rendered by app/shell/dashboard-page.tsx). It also
// proves the data layer end to end.
export function HomePage() {
  const { t } = useTranslation('home');
  const health = useApiHealth();
  return (
    <section className="grid gap-4 py-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t('api.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p role="status">{t(`api.${health.status}`)}</p>
          {health.status === 'ok' && health.version ? (
            <p className="text-sm text-muted-foreground">
              {t('api.version', { version: health.version })}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
