import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { InvitationsSection } from '../components/invitations-section';
import { InviteSheet } from '../components/invite-sheet';
import { MembersSection } from '../components/members-section';

/** Owner-only `/team`: who works in the business, who is invited, and the invite form. */
export function TeamPage() {
  const { t } = useTranslation('team');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section className="grid gap-5 py-4" aria-labelledby="team-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 id="team-title" className="text-2xl font-semibold">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus aria-hidden="true" />
          {t('invite.open')}
        </Button>
      </header>
      {notice ? <p role="status">{notice}</p> : null}
      <MembersSection onNotice={setNotice} />
      <InvitationsSection />
      <InviteSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={(email) => setNotice(t('invite.success', { email }))}
      />
    </section>
  );
}
