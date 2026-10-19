import {
  capitalSummarySchema,
  listCapitalMovementsResponseSchema,
  recordCapitalMovementResponseSchema,
  type CapitalSummary,
  type ListCapitalMovementsResponse,
  type RecordCapitalMovementRequest,
} from '@mini-market/contracts/equity';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/lib/api/api-context';
import { tenantKey } from '@/lib/api/query-keys';
import { useCurrentTenant } from '@/lib/auth/session';

export const CAPITAL_PAGE_SIZE = 20;

/** `GET /api/v1/capital/summary` (S8): contributed, withdrawn and net, in centavos. */
export function useCapitalSummary() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'capital', 'summary'),
    queryFn: ({ signal }) => api.get('/capital/summary', { schema: capitalSummarySchema, signal }),
    enabled: tenantId !== null,
  });
}

/** `GET /api/v1/capital/movements`, newest first. */
export function useCapitalMovements(page: number) {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  return useQuery({
    queryKey: tenantKey(tenantId, 'capital', 'movements', page),
    queryFn: ({ signal }) =>
      api.get(`/capital/movements?page=${page}&pageSize=${CAPITAL_PAGE_SIZE}`, {
        schema: listCapitalMovementsResponseSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
    enabled: tenantId !== null,
  });
}

/** `POST /api/v1/capital/movements`; refreshes the summary and the list when it succeeds. */
export function useRecordCapitalMovement() {
  const api = useApiClient();
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordCapitalMovementRequest) =>
      api.post('/capital/movements', { body, schema: recordCapitalMovementResponseSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tenantKey(tenantId, 'capital') }),
  });
}

export type { CapitalSummary, ListCapitalMovementsResponse };
