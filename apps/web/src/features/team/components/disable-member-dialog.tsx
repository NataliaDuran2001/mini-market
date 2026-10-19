import type { Member } from '@mini-market/contracts/access';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';

interface DisableMemberDialogProps {
  /** The member waiting for confirmation, or null when the dialog is closed. */
  readonly member: Member | null;
  readonly pending: boolean;
  readonly onConfirm: (member: Member) => void;
  readonly onCancel: () => void;
}

/** Disabling cuts access, so it asks first. Enabling again is one tap and needs no question. */
export function DisableMemberDialog({
  member,
  pending,
  onConfirm,
  onCancel,
}: DisableMemberDialogProps) {
  const { t } = useTranslation('team');
  return (
    <Dialog open={member !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('disableDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('disableDialog.description', { email: member?.email ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('disableDialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={pending || member === null}
            onClick={() => (member ? onConfirm(member) : undefined)}
          >
            {pending ? t('disableDialog.working') : t('disableDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
