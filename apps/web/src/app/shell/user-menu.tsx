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

/** Account sheet: who is signed in, switch business (when there are several) and logout. */
export function UserMenu() {
  const { t } = useTranslation('shell');
  const { session } = useSession();
  const { tenantId } = useCurrentTenant();
  const tenants = useMyTenants().data?.items ?? [];
  const switchTenant = useSwitchTenant();

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
            {session ? t('header.signedInAs', { email: session.email }) : null}
          </SheetDescription>
        </SheetHeader>
        {tenants.length > 1 ? (
          <section aria-label={t('header.switchTenant')} className="grid gap-2">
            <h3 className="text-sm font-medium">{t('header.switchTenant')}</h3>
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
        ) : null}
        <LogoutButton />
      </SheetContent>
    </Sheet>
  );
}
