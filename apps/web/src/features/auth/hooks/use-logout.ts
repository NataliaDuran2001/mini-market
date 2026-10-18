import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useAuthGateway, useTenantStore } from '@/lib/auth/session';

/** Ends the session, forgets the business and every cached query, then shows the login page. */
export function useLogout() {
  const gateway = useAuthGateway();
  const tenantStore = useTenantStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await gateway.signOut();
    } finally {
      tenantStore.clear();
      queryClient.clear();
    }
    await router.navigate({ to: '/login', search: {} });
  };
}
