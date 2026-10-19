import {
  listMembersResponseSchema,
  memberSchema,
  type Member,
} from '@mini-market/contracts/access';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

/** `GET /api/v1/members` (owner): every member of the business, active or disabled. */
export function useMembers() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'members', 'list'),
    queryFn: ({ signal }) => api.get('/members', { schema: listMembersResponseSchema, signal }),
    enabled: tenantId !== null,
  });
}

/**
 * `PATCH /api/v1/members/:userId` with `{ status }` (owner): a member is disabled or enabled again,
 * never deleted. Refreshes the list when it succeeds.
 */
export function useSetMemberStatus() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly userId: string; readonly status: Member['status'] }) =>
      api.patch(`/members/${input.userId}`, {
        body: { status: input.status },
        schema: memberSchema,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'members') }),
  });
}

export type { Member };
