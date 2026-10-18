import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { useApiHealth } from '../api/use-api-health';

// Placeholder until the dashboard lands (#15). It proves the data layer end to end.
export function HomePage() {
  const { t } = useTranslation('home');
  const health = useApiHealth();
  const status = health.isPending ? 'checking' : health.isError ? 'error' : 'ok';
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
        <CardContent>
          <p role="status">{t(`api.${status}`)}</p>
        </CardContent>
      </Card>
    </section>
  );
}
