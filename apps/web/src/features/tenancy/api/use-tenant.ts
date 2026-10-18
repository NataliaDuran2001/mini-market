import { tenantResponseSchema, type TenantResponse } from '@mini-market/contracts/tenancy';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

/** `GET /api/v1/tenant`: name and settings (modules, flags) of the selected business. */
export function useTenant() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'settings'),
    queryFn: ({ signal }) => api.get('/tenant', { schema: tenantResponseSchema, signal }),
    enabled: tenantId !== null,
  });
}

export type { TenantResponse };
