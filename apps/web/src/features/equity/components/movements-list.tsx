import type { CapitalMovement } from '@mini-market/contracts/equity';
import { Money } from '@mini-market/shared-kernel';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/format/date';
import { formatMoney } from '@/lib/format/money';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table';

/** Newest first. Withdrawals are shown with a minus sign; nothing here edits a movement. */
export function MovementsList({
  items,
  timeZone,
}: {
  items: readonly CapitalMovement[];
  timeZone: string;
}) {
  const { t } = useTranslation('equity');
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('list.date')}</TableHead>
          <TableHead>{t('list.kind')}</TableHead>
          <TableHead className="text-right">{t('list.amount')}</TableHead>
          <TableHead>{t('list.note')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((movement) => {
          const withdrawal = movement.kind === 'withdrawal';
          const amount = Money.fromCentavos(movement.amountCentavos);
          return (
            <TableRow key={movement.id}>
              <TableCell>{formatDate(movement.occurredAt, { timeZone })}</TableCell>
              <TableCell>{t(`kind.${movement.kind}`)}</TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  withdrawal ? 'text-destructive' : 'text-emerald-700',
                )}
              >
                {withdrawal ? '-' : '+'}
                {formatMoney(amount)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {movement.note ?? t('list.noNote')}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
