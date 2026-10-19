import type { Supplier } from '@mini-market/contracts/purchasing';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';

interface SupplierListProps {
  readonly suppliers: readonly Supplier[];
  /** Owner only: editing and switching a supplier on or off. Employees get a read-only list. */
  readonly canManage: boolean;
  readonly busyId: string | null;
  readonly onEdit: (supplier: Supplier) => void;
  readonly onToggleActive: (supplier: Supplier) => void;
}

const contactLine = (supplier: Supplier): string =>
  [supplier.phone, supplier.email, supplier.taxId].filter(Boolean).join(' · ');

export function SupplierList({
  suppliers,
  canManage,
  busyId,
  onEdit,
  onToggleActive,
}: SupplierListProps) {
  const { t } = useTranslation('purchasing');
  return (
    <ul className="grid gap-2">
      {suppliers.map((supplier) => (
        <li
          key={supplier.id}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="truncate">{supplier.name}</span>
              {supplier.active ? null : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {t('suppliers.inactive')}
                </span>
              )}
            </p>
            <p className="truncate text-sm text-muted-foreground">{contactLine(supplier)}</p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-label={t('suppliers.editNamed', { name: supplier.name })}
                onClick={() => onEdit(supplier)}
              >
                {t('suppliers.edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t(
                  supplier.active ? 'suppliers.deactivateNamed' : 'suppliers.activateNamed',
                  {
                    name: supplier.name,
                  },
                )}
                disabled={busyId === supplier.id}
                onClick={() => onToggleActive(supplier)}
              >
                {t(supplier.active ? 'suppliers.deactivate' : 'suppliers.activate')}
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
