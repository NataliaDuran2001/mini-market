import { useTranslation } from 'react-i18next';
import { useTenant } from '@/features/tenancy';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { Button } from '@/ui/button';
import { BusinessSection } from '../components/business-section';
import { FlagsSection } from '../components/flags-section';
import { ModulesSection } from '../components/modules-section';

/** Owner-only `/settings`: the business, its modules (read only) and the two editable rules. */
export function SettingsPage() {
  const { t, i18n } = useTranslation('settings');
  const tenant = useTenant();

  return (
    <section className="grid gap-5 py-4" aria-labelledby="settings-title">
      <header className="grid gap-1">
        <h1 id="settings-title" className="text-2xl font-semibold">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('description')}</p>
      </header>
      {tenant.isPending ? <p role="status">{t('loading')}</p> : null}
      {tenant.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{apiErrorMessage(i18n, tenant.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void tenant.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : null}
      {tenant.data ? (
        <>
          <BusinessSection tenant={tenant.data} />
          <ModulesSection modules={tenant.data.settings.modules} />
          <FlagsSection settings={tenant.data.settings} />
        </>
      ) : null}
    </section>
  );
}
