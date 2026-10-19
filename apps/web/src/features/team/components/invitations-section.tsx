import { useTranslation } from 'react-i18next';
import { useTenant } from '@/features/tenancy';
import { formatDate } from '@/lib/format/date';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';
import { teamErrorMessage } from '../api/error-message';
import { useInvitations } from '../api/invitations';

/** Invitations sent and not yet accepted. Renders nothing while there are none to show. */
export function InvitationsSection() {
  const { t, i18n } = useTranslation('team');
  const invitations = useInvitations();
  const tenant = useTenant();
  const timeZone = tenant.data?.settings.timezone;
  const dateOptions = timeZone === undefined ? {} : { timeZone };
  const items = invitations.data?.items ?? [];
  if (invitations.isSuccess && items.length === 0) return null;

  return (
    <section className="grid gap-3" aria-labelledby="invitations-title">
      <div className="grid gap-1">
        <h2 id="invitations-title" className="text-lg font-semibold">
          {t('invitations.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('invitations.description')}</p>
      </div>
      {invitations.isPending ? <p role="status">{t('invitations.loading')}</p> : null}
      {invitations.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{teamErrorMessage(i18n, invitations.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void invitations.refetch()}>
            {t('invitations.retry')}
          </Button>
        </div>
      ) : null}
      <ul className="grid gap-2">
        {items.map((invitation) => {
          const pending = invitation.status === 'pending';
          return (
            <li key={invitation.id} className="grid gap-1 rounded-xl border bg-card p-3">
              <p className="font-medium break-all">{invitation.email}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t(`role.${invitation.role}`)}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    pending ? 'bg-amber-100 text-amber-900' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t(`status.${invitation.status}`)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {t('invitations.dates', {
                  sent: formatDate(invitation.invitedAt, dateOptions),
                  expires: formatDate(invitation.expiresAt, dateOptions),
                })}
              </p>
              {pending ? null : (
                <p className="text-xs text-muted-foreground">{t('invitations.expiredHint')}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
