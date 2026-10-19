import type { Member } from '@mini-market/contracts/access';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/lib/auth/session';
import { Button } from '@/ui/button';
import { teamErrorMessage } from '../api/error-message';
import { useMembers, useSetMemberStatus } from '../api/members';
import { DisableMemberDialog } from './disable-member-dialog';
import { MembersList } from './members-list';

/** Members of the business with the disable and enable actions; reports results via `onNotice`. */
export function MembersSection({ onNotice }: { readonly onNotice: (message: string) => void }) {
  const { t, i18n } = useTranslation('team');
  const members = useMembers();
  const setStatus = useSetMemberStatus();
  const { session } = useSession();
  const [confirming, setConfirming] = useState<Member | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const change = (member: Member, status: Member['status']) => {
    setFailure(null);
    setStatus.mutate(
      { userId: member.userId, status },
      {
        onSuccess: () => {
          setConfirming(null);
          onNotice(
            t(status === 'disabled' ? 'members.disabled' : 'members.enabled', {
              email: member.email,
            }),
          );
        },
        onError: (error) => {
          setConfirming(null);
          setFailure(teamErrorMessage(i18n, error));
        },
      },
    );
  };

  const items = members.data?.items ?? [];
  return (
    <section className="grid gap-3" aria-labelledby="members-title">
      <h2 id="members-title" className="text-lg font-semibold">
        {t('members.title')}
      </h2>
      {members.isPending ? <p role="status">{t('members.loading')}</p> : null}
      {members.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">{teamErrorMessage(i18n, members.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void members.refetch()}>
            {t('members.retry')}
          </Button>
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure}
        </p>
      ) : null}
      {members.isSuccess && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('members.empty')}</p>
      ) : null}
      {items.length > 0 ? (
        <MembersList
          members={items}
          currentUserId={session?.userId ?? null}
          busyId={setStatus.isPending ? (setStatus.variables?.userId ?? null) : null}
          onDisable={setConfirming}
          onEnable={(member) => change(member, 'active')}
        />
      ) : null}
      <DisableMemberDialog
        member={confirming}
        pending={setStatus.isPending}
        onConfirm={(member) => change(member, 'disabled')}
        onCancel={() => setConfirming(null)}
      />
    </section>
  );
}
