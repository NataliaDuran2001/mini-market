import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '../components/auth-card';
import { ForgotPasswordForm } from '../components/forgot-password-form';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  return (
    <AuthCard title={t('forgot.title')} description={t('forgot.description')}>
      <ForgotPasswordForm />
      <Link to="/login" search={{}} className="text-sm underline underline-offset-4">
        {t('forgot.backToLogin')}
      </Link>
    </AuthCard>
  );
}
