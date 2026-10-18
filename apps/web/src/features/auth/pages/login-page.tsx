import { useTranslation } from 'react-i18next';

// Placeholder until the auth flows land (#14).
export function LoginPage() {
  const { t } = useTranslation('auth');
  return (
    <section className="grid gap-3 py-8">
      <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
      <p className="text-muted-foreground">{t('login.placeholder')}</p>
    </section>
  );
}
