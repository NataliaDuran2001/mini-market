import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/form';
import { Input } from '@/ui/input';
import { setPasswordSchema, type SetPasswordValues } from '../schemas';

/**
 * New password with confirmation, shared by password recovery and invitation acceptance.
 * `onSubmitPassword` returns the Spanish error to show, or null when it worked.
 */
export function SetPasswordForm({
  submitLabel,
  onSubmitPassword,
}: {
  submitLabel: string;
  onSubmitPassword: (password: string) => Promise<string | null>;
}) {
  const { t } = useTranslation('auth');
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const submit = form.handleSubmit(async ({ password }) => {
    setFailure(await onSubmitPassword(password));
  });

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('setPassword.password')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('setPassword.confirm')}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
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
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
