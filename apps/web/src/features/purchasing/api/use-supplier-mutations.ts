import {
  supplierSchema,
  type CreateSupplierRequest,
  type UpdateSupplierRequest,
  type Supplier,
} from '@mini-market/contracts/purchasing';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

/** Refreshes every supplier list of the business after a change, wherever it is shown. */
function useRefreshSuppliers() {
  const queryClient = useQueryClient();
  const { tenantId } = useCurrentTenant();
  return () => queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'suppliers') });
}

/** `POST /api/v1/suppliers` (owner). */
export function useCreateSupplier() {
  const api = useApiClient();
  const refresh = useRefreshSuppliers();
  return useMutation({
    mutationFn: (body: CreateSupplierRequest) =>
      api.post('/suppliers', { body, schema: supplierSchema }),
    onSuccess: refresh,
  });
}

/** `PATCH /api/v1/suppliers/:id` with the details (owner). */
export function useUpdateSupplier() {
  const api = useApiClient();
  const refresh = useRefreshSuppliers();
  return useMutation({
    mutationFn: (input: { readonly id: string; readonly body: UpdateSupplierRequest }) =>
      api.patch(`/suppliers/${input.id}`, { body: input.body, schema: supplierSchema }),
    onSuccess: refresh,
  });
}

/** `PATCH /api/v1/suppliers/:id` with `{ active }` (owner): a supplier is switched off, not deleted. */
export function useSetSupplierActive() {
  const api = useApiClient();
  const refresh = useRefreshSuppliers();
  return useMutation({
    mutationFn: (input: Pick<Supplier, 'id' | 'active'>) =>
      api.patch(`/suppliers/${input.id}`, {
        body: { active: input.active },
        schema: supplierSchema,
      }),
    onSuccess: refresh,
  });
}
