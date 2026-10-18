import { acceptInvitationRequestSchema } from '@mini-market/contracts/access';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { useAuthGateway, useSession } from '@/lib/auth/session';
import { useAcceptInvitation } from '../api/accept-invitation';
import { AuthCard } from '../components/auth-card';
import { SetPasswordForm } from '../components/set-password-form';

/**
 * Landing page of the invitation email: the link signs the invitee in (Supabase invite flow) and
 * carries the invitation `token`. They choose a password, then the API creates the membership.
 */
export function AcceptInvitationPage({ token }: { token: string | undefined }) {
  const { t, i18n } = useTranslation('auth');
  const gateway = useAuthGateway();
  const router = useRouter();
  const { status } = useSession();
  const accept = useAcceptInvitation();
  const parsed = acceptInvitationRequestSchema.safeParse({ token });

  const join = async (password: string): Promise<string | null> => {
    if (!parsed.success) return t('invitation.invalidLink');
    const passwordResult = await gateway.updatePassword(password);
    if (!passwordResult.ok) return t(`errors.${passwordResult.code}`);
    try {
      await accept.mutateAsync(parsed.data);
    } catch (error) {
      return apiErrorMessage(i18n, error);
    }
    router.history.push('/');
    return null;
  };

  const usable = parsed.success && status === 'authenticated';
  return (
    <AuthCard title={t('invitation.title')} description={t('invitation.description')}>
      {status === 'loading' ? <p role="status">{t('loading')}</p> : null}
      {usable ? (
        <SetPasswordForm submitLabel={t('invitation.submit')} onSubmitPassword={join} />
      ) : null}
      {status === 'anonymous' || (status === 'authenticated' && !parsed.success) ? (
        <>
          <p role="alert">{t('invitation.invalidLink')}</p>
          <Link to="/login" search={{}} className="text-sm underline underline-offset-4">
            {t('forgot.backToLogin')}
          </Link>
        </>
      ) : null}
    </AuthCard>
  );
}
