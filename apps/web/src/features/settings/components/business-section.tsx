import type { TenantResponse } from '@mini-market/contracts/tenancy';
import { useTranslation } from 'react-i18next';

/** Read-only facts of the business: name, vertical (rubro), time zone and currency. */
export function BusinessSection({ tenant }: { readonly tenant: TenantResponse }) {
  const { t } = useTranslation('settings');
  const rows = [
    { key: 'name', value: tenant.name },
    { key: 'vertical', value: t(`vertical.${tenant.settings.vertical}`) },
    { key: 'timezone', value: tenant.settings.timezone },
    { key: 'currency', value: t(`currency.${tenant.settings.currency}`) },
  ] as const;
  return (
    <section className="grid gap-3" aria-labelledby="business-title">
      <h2 id="business-title" className="text-lg font-semibold">
        {t('business.title')}
      </h2>
      <dl className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="grid min-w-0 gap-0.5">
            <dt className="text-sm text-muted-foreground">{t(`business.${row.key}`)}</dt>
            <dd className="font-medium break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
