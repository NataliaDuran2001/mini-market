import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCurrentTenant } from '@/lib/auth/session';
import { Button } from '@/ui/button';
import { useMyTenants } from '../api/my-tenants';
import { AuthCard } from '../components/auth-card';
import { LogoutButton } from '../components/logout-button';

/** Several businesses: the person picks one. None: they are told to ask for an invitation. */
export function SelectTenantPage() {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const { setTenantId } = useCurrentTenant();
  const tenants = useMyTenants();

  const choose = (tenantId: string) => {
    setTenantId(tenantId);
    router.history.push('/');
  };

  const items = tenants.data?.items ?? [];
  return (
    <AuthCard title={t('selectTenant.title')} description={t('selectTenant.description')}>
      {tenants.isPending ? <p role="status">{t('loading')}</p> : null}
      {tenants.isError ? <p role="alert">{t('selectTenant.error')}</p> : null}
      {tenants.isSuccess && items.length === 0 ? (
        <p role="status">{t('selectTenant.empty')}</p>
      ) : null}
      <ul className="grid gap-2">
        {items.map((tenant) => (
          <li key={tenant.tenantId}>
            <Button
              variant="outline"
              className="h-auto w-full justify-between py-3"
              onClick={() => {
                choose(tenant.tenantId);
              }}
            >
              <span>{tenant.name}</span>
              <span className="text-xs text-muted-foreground">{t(`roles.${tenant.role}`)}</span>
            </Button>
          </li>
        ))}
      </ul>
      <LogoutButton variant="ghost" />
    </AuthCard>
  );
}
