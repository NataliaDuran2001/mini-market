import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { TENANT_SCOPE } from '@/lib/api/query-keys';
import { useTenantStore } from '@/lib/auth/session';

/**
 * Changes the business the person works in. In-flight requests of the old business are cancelled
 * before the selection changes, and its cached data is removed (not just marked stale), so a
 * response of one business can never land under, or be shown for, another.
 */
export function useSwitchTenant() {
  const tenantStore = useTenantStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (tenantId: string) => {
    if (tenantStore.get() === tenantId) return;
    await queryClient.cancelQueries({ queryKey: TENANT_SCOPE });
    tenantStore.set(tenantId);
    queryClient.removeQueries({ queryKey: TENANT_SCOPE });
    await router.navigate({ to: '/' });
  };
}
