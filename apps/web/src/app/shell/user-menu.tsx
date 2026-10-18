import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogoutButton, useMyTenants } from '@/features/auth';
import { useSwitchTenant } from '@/features/tenancy';
import { useCurrentTenant, useSession } from '@/lib/auth/session';
import { Button } from '@/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/ui/sheet';

/** Business picker, shown only when the person belongs to more than one. */
function TenantSwitcher() {
  const { t } = useTranslation('shell');
  const { tenantId } = useCurrentTenant();
  const tenants = useMyTenants().data?.items ?? [];
  const switchTenant = useSwitchTenant();
  if (tenants.length < 2) return null;
  return (
    <section aria-labelledby="switch-tenant-title" className="grid gap-2">
      <h3 id="switch-tenant-title" className="text-sm font-medium">
        {t('header.switchTenant')}
      </h3>
      <ul className="grid gap-2">
        {tenants.map((tenant) => (
          <li key={tenant.tenantId}>
            <SheetClose asChild>
              <Button
                variant={tenant.tenantId === tenantId ? 'secondary' : 'outline'}
                aria-current={tenant.tenantId === tenantId ? 'true' : undefined}
                className="w-full justify-start"
                onClick={() => {
                  void switchTenant(tenant.tenantId);
                }}
              >
                {tenant.name}
              </Button>
            </SheetClose>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Account sheet: who is signed in, switch business and logout. */
export function UserMenu() {
  const { t } = useTranslation('shell');
  const { session } = useSession();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('header.account')}>
          <UserRound aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('header.account')}</SheetTitle>
          <SheetDescription>
            {t('header.signedInAs', { email: session?.email ?? '' })}
          </SheetDescription>
        </SheetHeader>
        <TenantSwitcher />
        <LogoutButton />
      </SheetContent>
    </Sheet>
  );
}
