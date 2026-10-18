import { useTranslation } from 'react-i18next';
import { useMyTenants } from '@/features/auth';
import { useCurrentTenant } from '@/lib/auth/session';
import { UserMenu } from './user-menu';

/** Name of the business the person is working in, and the account menu. */
export function ShellHeader() {
  const { t } = useTranslation('shell');
  const { tenantId } = useCurrentTenant();
  const tenants = useMyTenants();
  const name = tenants.data?.items.find((tenant) => tenant.tenantId === tenantId)?.name;
  const fallback = tenants.isSuccess ? t('header.tenantUnknown') : t('header.tenantLoading');
  return (
    <header className="flex items-center justify-between gap-2 pb-2">
      <p data-testid="tenant-name" className="min-w-0 truncate text-lg font-semibold">
        {name ?? fallback}
      </p>
      <UserMenu />
    </header>
  );
}
