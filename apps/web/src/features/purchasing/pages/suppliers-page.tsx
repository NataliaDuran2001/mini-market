import type { Supplier } from '@mini-market/contracts/purchasing';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { toast } from '@/ui/sonner';
import { purchasingErrorMessage } from '../api/error-message';
import { useSetSupplierActive } from '../api/use-supplier-mutations';
import { useSuppliers } from '../api/use-suppliers';
import { SupplierList } from '../components/supplier-list';
import { SupplierSheet } from '../components/supplier-sheet';
import { useDebouncedValue } from '../hooks/use-debounced-value';

const SEARCH_DELAY_MS = 250;

/** `/compras/proveedores`: everyone with `purchases.create` sees the list; the owner manages it. */
export function SuppliersPage() {
  const { t, i18n } = useTranslation('purchasing');
  const canManage = useCan('suppliers.manage');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const suppliers = useSuppliers(q === '' ? {} : { q });
  const setActive = useSetSupplierActive();
  // `null` closed, `{ supplier: null }` creating, `{ supplier }` editing.
  const [sheet, setSheet] = useState<{ supplier: Supplier | null } | null>(null);

  const toggleActive = ({ id, active }: Supplier) =>
    setActive.mutate(
      { id, active: !active },
      {
        onSuccess: () =>
          toast.success(t(active ? 'suppliers.toast.deactivated' : 'suppliers.toast.activated')),
        onError: (error) => toast.error(purchasingErrorMessage(i18n, error)),
      },
    );

  const items = suppliers.data?.items ?? [];
  return (
    <section className="grid gap-4" aria-labelledby="suppliers-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="suppliers-title" className="text-2xl font-semibold">
            {t('suppliers.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('suppliers.description')}</p>
        </div>
        {canManage ? (
          <Button onClick={() => setSheet({ supplier: null })}>
            <Plus aria-hidden="true" />
            {t('suppliers.new')}
          </Button>
        ) : null}
      </header>
      <Input
        type="search"
        aria-label={t('suppliers.search')}
        placeholder={t('suppliers.searchPlaceholder')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {suppliers.isPending ? <p role="status">{t('suppliers.loading')}</p> : null}
      {suppliers.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{t('suppliers.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void suppliers.refetch()}>
            {t('suppliers.retry')}
          </Button>
        </div>
      ) : null}
      {suppliers.isSuccess && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q === '' ? t('suppliers.empty') : t('suppliers.emptySearch')}
          {q === '' && canManage ? ` ${t('suppliers.emptyOwner')}` : null}
        </p>
      ) : null}
      {items.length > 0 ? (
        <SupplierList
          suppliers={items}
          canManage={canManage}
          busyId={setActive.isPending ? (setActive.variables?.id ?? null) : null}
          onEdit={(supplier) => setSheet({ supplier })}
          onToggleActive={toggleActive}
        />
      ) : null}
      {canManage ? null : (
        <p className="text-sm text-muted-foreground">{t('suppliers.readOnly')}</p>
      )}
      <SupplierSheet
        open={sheet !== null}
        supplier={sheet?.supplier ?? null}
        onOpenChange={(open) => (open ? undefined : setSheet(null))}
      />
    </section>
  );
}
