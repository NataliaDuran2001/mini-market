import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';
import { useLogout } from '../hooks/use-logout';

export function LogoutButton({ variant = 'outline' }: { variant?: 'outline' | 'ghost' }) {
  const { t } = useTranslation('auth');
  const logout = useLogout();
  return (
    <Button
      variant={variant}
      onClick={() => {
        void logout();
      }}
    >
      {t('logout')}
    </Button>
  );
}
