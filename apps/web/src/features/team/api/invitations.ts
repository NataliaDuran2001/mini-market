import {
  inviteMemberResponseSchema,
  listInvitationsResponseSchema,
  type Invitation,
  type InviteMemberRequest,
} from '@mini-market/contracts/access';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

/** `GET /api/v1/invitations` (owner): sent and not used, newest first. Never carries a token. */
export function useInvitations() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'invitations', 'list'),
    queryFn: ({ signal }) =>
      api.get('/invitations', { schema: listInvitationsResponseSchema, signal }),
    enabled: tenantId !== null,
  });
}

/** `POST /api/v1/auth/invitations` (owner); the pending invitation shows in the list afterwards. */
export function useInviteMember() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteMemberRequest) =>
      api.post('/auth/invitations', { body, schema: inviteMemberResponseSchema }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'invitations') }),
  });
}

export type { Invitation };
