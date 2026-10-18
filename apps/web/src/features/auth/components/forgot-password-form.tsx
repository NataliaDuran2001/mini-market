import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuthGateway } from '@/lib/auth/session';
import { Button } from '@/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/ui/form';
import { Input } from '@/ui/input';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../schemas';

/** The answer never says whether the address has an account. */
export function ForgotPasswordForm() {
  const { t } = useTranslation('auth');
  const gateway = useAuthGateway();
  const [outcome, setOutcome] = useState<{ sent: boolean; message: string } | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const submit = form.handleSubmit(async ({ email }) => {
    const redirectTo = `${window.location.origin}/reset-password`;
    const result = await gateway.requestPasswordReset({ email, redirectTo });
    const retryable =
      !result.ok && (result.code === 'RATE_LIMITED' || result.code === 'NETWORK_ERROR');
    setOutcome(
      retryable
        ? { sent: false, message: t(`errors.${result.code}`) }
        : { sent: true, message: t('forgot.sent') },
    );
  });

  if (outcome?.sent) return <p role="status">{outcome.message}</p>;

  return (
    <Form {...form}>
      <form onSubmit={(event) => void submit(event)} noValidate className="grid gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('login.email')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {outcome ? (
          <p role="alert" className="text-sm text-destructive">
            {outcome.message}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('forgot.submit')}
        </Button>
      </form>
    </Form>
  );
}
