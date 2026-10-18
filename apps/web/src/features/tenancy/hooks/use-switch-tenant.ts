import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { TENANT_SCOPE } from '@/lib/api/query-keys';
import { useTenantStore } from '@/lib/auth/session';

/**
 * Changes the business the person works in: the selection is saved, every tenant-scoped query is
 * invalidated (they refetch with the new `X-Tenant-Id`) and the person goes back to the start.
 */
export function useSwitchTenant() {
  const tenantStore = useTenantStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  return async (tenantId: string) => {
    if (tenantStore.get() === tenantId) return;
    tenantStore.set(tenantId);
    await queryClient.invalidateQueries({ queryKey: TENANT_SCOPE });
    await router.navigate({ to: '/' });
  };
}
