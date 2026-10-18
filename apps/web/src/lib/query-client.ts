import { QueryClient } from '@tanstack/react-query';

export const QUERY_RETRY = 1;
export const QUERY_STALE_TIME_MS = 30_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: QUERY_RETRY, staleTime: QUERY_STALE_TIME_MS },
    },
  });
}
