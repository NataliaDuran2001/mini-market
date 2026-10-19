import { Money } from '@mini-market/shared-kernel';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/lib/format/money';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import type { CapitalSummary } from '../api/capital';

/** Aportado, retirado and neto (S8). The net is red when the owner took out more than they put in. */
export function SummaryCards({ summary }: { summary: CapitalSummary }) {
  const { t } = useTranslation('equity');
  const cards = [
    { id: 'contributed', label: t('summary.contributed'), centavos: summary.contributedCentavos },
    { id: 'withdrawn', label: t('summary.withdrawn'), centavos: summary.withdrawnCentavos },
    { id: 'net', label: t('summary.net'), centavos: summary.netCentavos },
  ] as const;
  return (
    <section aria-label={t('summary.title')} className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.id} data-testid={`summary-${card.id}`}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                card.centavos < 0 && 'text-destructive',
              )}
            >
              {formatMoney(Money.fromCentavos(card.centavos))}
            </p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
