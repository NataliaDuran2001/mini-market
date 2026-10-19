import { listSuppliersResponseSchema, type Supplier } from '@mini-market/contracts/purchasing';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

export interface SupplierFilter {
  /** Matches name, phone, email and tax id. */
  readonly q?: string;
  readonly active?: boolean;
}

function toQueryString(filter: SupplierFilter): string {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.active !== undefined) params.set('active', String(filter.active));
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * `GET /api/v1/suppliers`. The purchase screen picks from `useSuppliers({ active: true })`, so a
 * supplier saved on the suppliers page shows up there without a reload.
 */
export function useSuppliers(filter: SupplierFilter = {}) {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'suppliers', 'list', filter),
    queryFn: ({ signal }) =>
      api.get(`/suppliers${toQueryString(filter)}`, {
        schema: listSuppliersResponseSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: tenantId !== null,
  });
}

export type { Supplier };
