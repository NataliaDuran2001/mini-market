import type { TenantResponse } from '@mini-market/contracts/tenancy';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const MODULES = ['lots', 'fractional', 'credit_sales', 'custom_fields'] as const;

/**
 * Module flags of the preset, read only: there is no control here on purpose (ADR 0006, modules
 * are operator-managed in v1).
 */
export function ModulesSection({
  modules,
}: {
  readonly modules: TenantResponse['settings']['modules'];
}) {
  const { t } = useTranslation('settings');
  return (
    <section className="grid gap-3" aria-labelledby="modules-title">
      <div className="grid gap-1">
        <h2 id="modules-title" className="text-lg font-semibold">
          {t('modules.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('modules.description')}</p>
      </div>
      <ul className="grid gap-2">
        {MODULES.map((module) => {
          const enabled = modules[module];
          return (
            <li
              key={module}
              data-module={module}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
            >
              <div className="grid min-w-0 gap-0.5">
                <p className="font-medium">{t(`modules.${module}.name`)}</p>
                <p className="text-sm text-muted-foreground">
                  {t(`modules.${module}.description`)}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs',
                  enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground',
                )}
              >
                {t(enabled ? 'modules.on' : 'modules.off')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
