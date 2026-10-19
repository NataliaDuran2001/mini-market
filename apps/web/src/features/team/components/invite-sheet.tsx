import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/form';
import { Input } from '@/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/ui/sheet';
import { teamErrorMessage } from '../api/error-message';
import { useInviteMember } from '../api/invitations';
import { inviteFormSchema, toInviteRequest, type InviteFormValues } from '../schemas';

interface InviteSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called with the address the invitation went to, after the API accepted it. */
  readonly onInvited: (email: string) => void;
}

/** Bottom sheet with the invite form: one email field, the role is always employee. */
export function InviteSheet(props: InviteSheetProps) {
  const { t } = useTranslation('team');
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t('invite.title')}</SheetTitle>
          <SheetDescription>{t('invite.description')}</SheetDescription>
        </SheetHeader>
        <InviteForm {...props} />
      </SheetContent>
    </Sheet>
  );
}

function InviteForm({ onOpenChange, onInvited }: InviteSheetProps) {
  const { t, i18n } = useTranslation('team');
  const invite = useInviteMember();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '' },
  });

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const receipt = await invite.mutateAsync(toInviteRequest(values));
      onInvited(receipt.email);
      onOpenChange(false);
    } catch (error) {
      setFailure(teamErrorMessage(i18n, error));
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('invite.email')}</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" autoComplete="off" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">{t('invite.emailHint')}</p>
              <FormMessage />
            </FormItem>
          )}
        />
        {failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? t('invite.sending') : t('invite.submit')}
        </Button>
      </form>
    </Form>
  );
}
