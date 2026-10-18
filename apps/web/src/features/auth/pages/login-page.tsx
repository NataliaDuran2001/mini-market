import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';
import { AuthCard } from '../components/auth-card';
import { LoginForm } from '../components/login-form';

/** `redirect` is where the person was going when the session ended (see requireAuth). */
export function LoginPage({ redirect }: { redirect?: string | undefined }) {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const goBack = () => {
    router.history.push(safeRedirectPath(redirect));
  };
  return (
    <AuthCard title={t('login.title')} description={t('login.description')}>
      <LoginForm onSignedIn={goBack} />
      <Link to="/forgot-password" className="text-sm underline underline-offset-4">
        {t('login.forgot')}
      </Link>
    </AuthCard>
  );
}
