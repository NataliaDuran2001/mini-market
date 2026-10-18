import {
  acceptInvitationResponseSchema,
  type AcceptInvitationRequest,
} from '@mini-market/contracts/access';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { useTenantStore } from '@/lib/auth/session';
import { MY_TENANTS_KEY } from './my-tenants';

/** `POST /api/v1/invitations/accept`. The token names the tenant, so no `X-Tenant-Id` is sent. */
export function useAcceptInvitation() {
  const api = useApiClient();
  const tenantStore = useTenantStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AcceptInvitationRequest) =>
      api.post('/invitations/accept', {
        body,
        schema: acceptInvitationResponseSchema,
        withTenant: false,
      }),
    onSuccess: async ({ tenantId }) => {
      tenantStore.set(tenantId);
      await queryClient.invalidateQueries({ queryKey: MY_TENANTS_KEY });
    },
  });
}
