import { myTenantsResponseSchema, type MyTenant } from '@mini-market/contracts/access';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@/lib/api/client';
import { useApiClient } from '@/lib/api/api-context';

/** `GET /api/v1/me/tenants`: the businesses of the signed-in person. Not scoped to a tenant. */
export const MY_TENANTS_KEY = ['me', 'tenants'] as const;

export function myTenantsQueryOptions(api: ApiClient) {
  return queryOptions({
    queryKey: MY_TENANTS_KEY,
    queryFn: ({ signal }) =>
      api.get('/me/tenants', { schema: myTenantsResponseSchema, signal, withTenant: false }),
  });
}

export function useMyTenants() {
  return useQuery(myTenantsQueryOptions(useApiClient()));
}

export type { MyTenant };
