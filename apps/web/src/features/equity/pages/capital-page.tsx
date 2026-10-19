import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/features/tenancy';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { Button } from '@/ui/button';
import { useCapitalSummary } from '../api/capital';
import { MovementsSection } from '../components/movements-section';
import { RecordMovementSheet } from '../components/record-movement-sheet';
import { SummaryCards } from '../components/summary-cards';

const DEFAULT_TIME_ZONE = 'America/La_Paz';

/** Owner-only capital screen (S8): totals, the ledger and the sheet that records a movement. */
export function CapitalPage() {
  const { t, i18n } = useTranslation('equity');
  const summary = useCapitalSummary();
  const tenant = useTenant();
  const timeZone = tenant.data?.settings.timezone ?? DEFAULT_TIME_ZONE;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<'saved' | 'overdrawn' | null>(null);

  return (
    <section className="grid gap-4 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>{t('record.open')}</Button>
      </header>
      {notice ? (
        <p role="status" className={notice === 'overdrawn' ? 'text-destructive' : undefined}>
          {notice === 'overdrawn' ? t('record.warning') : t('record.success')}
        </p>
      ) : null}
      {summary.data ? <SummaryCards summary={summary.data} /> : null}
      {summary.isPending ? <p role="status">{t('summary.loading')}</p> : null}
      {summary.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p className="text-destructive">{apiErrorMessage(i18n, summary.error)}</p>
          <Button variant="outline" onClick={() => void summary.refetch()}>
            {t('summary.retry')}
          </Button>
        </div>
      ) : null}
      <h2 className="text-lg font-semibold">{t('list.title')}</h2>
      <MovementsSection timeZone={timeZone} />
      <RecordMovementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        timeZone={timeZone}
        onRecorded={(warning) => setNotice(warning ? 'overdrawn' : 'saved')}
      />
    </section>
  );
}
