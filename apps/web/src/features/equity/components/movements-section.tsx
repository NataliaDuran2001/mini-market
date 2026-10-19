import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { Button } from '@/ui/button';
import { CAPITAL_PAGE_SIZE, useCapitalMovements } from '../api/capital';
import { MovementsList } from './movements-list';

/** The ledger: loading, error, empty and paged states around the list. */
export function MovementsSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation('equity');
  const [page, setPage] = useState(1);
  const movements = useCapitalMovements(page);

  if (movements.isPending) return <p role="status">{t('list.loading')}</p>;
  if (movements.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p className="text-destructive">{apiErrorMessage(i18n, movements.error)}</p>
        <Button variant="outline" onClick={() => void movements.refetch()}>
          {t('list.retry')}
        </Button>
      </div>
    );
  }
  const { items, total } = movements.data;
  if (total === 0) return <p className="text-muted-foreground">{t('list.empty')}</p>;
  const pages = Math.max(1, Math.ceil(total / CAPITAL_PAGE_SIZE));
  return (
    <div className="grid gap-3">
      <MovementsList items={items} timeZone={timeZone} />
      <nav className="flex items-center justify-between gap-2" aria-label={t('list.title')}>
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t('list.previous')}
        </Button>
        <span className="text-sm text-muted-foreground">{t('list.pageOf', { page, pages })}</span>
        <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          {t('list.next')}
        </Button>
      </nav>
    </div>
  );
}
