import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthGateway, useSession } from '@/lib/auth/session';
import { AuthCard } from '../components/auth-card';
import { SetPasswordForm } from '../components/set-password-form';

/** The recovery link in the email signs the person in; here they choose the new password. */
export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const gateway = useAuthGateway();
  const router = useRouter();
  const { status } = useSession();

  const changePassword = async (password: string): Promise<string | null> => {
    const result = await gateway.updatePassword(password);
    if (!result.ok) return t(`errors.${result.code}`);
    router.history.push('/');
    return null;
  };

  return (
    <AuthCard title={t('reset.title')} description={t('reset.description')}>
      {status === 'loading' ? <p role="status">{t('loading')}</p> : null}
      {status === 'authenticated' ? (
        <SetPasswordForm submitLabel={t('reset.submit')} onSubmitPassword={changePassword} />
      ) : null}
      {status === 'anonymous' ? (
        <>
          <p role="alert">{t('reset.invalidLink')}</p>
          <Link to="/forgot-password" className="text-sm underline underline-offset-4">
            {t('reset.requestAnother')}
          </Link>
        </>
      ) : null}
    </AuthCard>
  );
}
