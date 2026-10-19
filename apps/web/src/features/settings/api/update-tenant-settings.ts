import {
  tenantResponseSchema,
  type UpdateTenantSettingsInput,
} from '@mini-market/contracts/tenancy';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

/**
 * `PATCH /api/v1/tenant/settings` (owner). This screen only sends `allowNegativeStock` and
 * `employeeCanVoid`; the module flags stay operator-managed in v1. The response is the whole
 * tenant, so the shared `useTenant` cache is replaced with it and every screen sees the change.
 */
export function useUpdateTenantSettings() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Pick<UpdateTenantSettingsInput, 'allowNegativeStock' | 'employeeCanVoid'>,
    ) => api.patch('/tenant/settings', { body: patch, schema: tenantResponseSchema }),
    onSuccess: (tenant) => {
      queryClient.setQueryData(tenantKey(tenantId, 'settings'), tenant);
    },
  });
}
