import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useApiClient } from '@/lib/api/api-context';

// GET /api/v1/health. Kept local: the endpoint has no business contract in @mini-market/contracts.
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function useApiHealth() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get('/health', { schema: healthResponseSchema, signal }),
  });
}
