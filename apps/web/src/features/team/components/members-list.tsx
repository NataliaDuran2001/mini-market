import type { Member } from '@mini-market/contracts/access';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/button';

interface MembersListProps {
  readonly members: readonly Member[];
  /** The signed-in person: they cannot switch themselves off from here. */
  readonly currentUserId: string | null;
  readonly busyId: string | null;
  readonly onDisable: (member: Member) => void;
  readonly onEnable: (member: Member) => void;
}

/** Members with role and state; cards, not a table, so a phone never scrolls sideways. */
export function MembersList({
  members,
  currentUserId,
  busyId,
  onDisable,
  onEnable,
}: MembersListProps) {
  const { t } = useTranslation('team');
  return (
    <ul className="grid gap-2">
      {members.map((member) => {
        const active = member.status === 'active';
        return (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"
          >
            <div className="grid min-w-0 gap-1">
              <p className="font-medium break-all">
                {member.email}
                {member.userId === currentUserId ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({t('members.you')})
                  </span>
                ) : null}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t(`role.${member.role}`)}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    active ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t(`status.${member.status}`)}
                </span>
              </p>
            </div>
            {member.userId === currentUserId ? null : (
              <Button
                size="sm"
                variant="outline"
                aria-label={t(active ? 'members.disableNamed' : 'members.enableNamed', {
                  email: member.email,
                })}
                disabled={busyId === member.userId}
                onClick={() => (active ? onDisable(member) : onEnable(member))}
              >
                {t(active ? 'members.disable' : 'members.enable')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
