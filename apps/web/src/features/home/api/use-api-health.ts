import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useApiClient } from '@/lib/api/api-context';

// GET /api/v1/health. Kept local: the endpoint has no business contract in @mini-market/contracts.
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type ApiHealth =
  | { readonly status: 'checking' }
  | { readonly status: 'error' }
  | { readonly status: 'ok'; readonly version: string | undefined };

export function useApiHealth(): ApiHealth {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get('/health', { schema: healthResponseSchema, signal }),
  });
  if (query.isPending) return { status: 'checking' };
  if (query.isError) return { status: 'error' };
  return { status: 'ok', version: query.data.version };
}
