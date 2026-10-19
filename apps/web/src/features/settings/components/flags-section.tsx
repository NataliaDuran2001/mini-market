import type { TenantResponse } from '@mini-market/contracts/tenancy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { useUpdateTenantSettings } from '../api/update-tenant-settings';

const FLAGS = ['allowNegativeStock', 'employeeCanVoid'] as const;
type Flag = (typeof FLAGS)[number];

/** The two rules the owner may change; each switch saves on its own. */
export function FlagsSection({ settings }: { readonly settings: TenantResponse['settings'] }) {
  const { t, i18n } = useTranslation('settings');
  const update = useUpdateTenantSettings();
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const change = (flag: Flag, value: boolean) => {
    setFailure(null);
    setSaved(false);
    update.mutate(
      { [flag]: value },
      {
        onSuccess: () => setSaved(true),
        onError: (error) => setFailure(apiErrorMessage(i18n, error)),
      },
    );
  };

  return (
    <section className="grid gap-3" aria-labelledby="flags-title">
      <div className="grid gap-1">
        <h2 id="flags-title" className="text-lg font-semibold">
          {t('flags.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('flags.description')}</p>
      </div>
      <ul className="grid gap-2">
        {FLAGS.map((flag) => (
          <li key={flag} className="rounded-xl border bg-card p-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={settings[flag]}
                disabled={update.isPending}
                onChange={(event) => change(flag, event.target.checked)}
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-medium">{t(`flags.${flag}.label`)}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`flags.${flag}.description`)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {update.isPending ? <p role="status">{t('flags.saving')}</p> : null}
      {saved ? <p role="status">{t('flags.saved')}</p> : null}
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
