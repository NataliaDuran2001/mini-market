import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './client';

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({
  client,
  children,
}: {
  client: ApiClient;
  children: ReactNode;
}) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

/** Hooks in `features/<x>/api` get the client from here; components never call fetch. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient requires an ApiClientProvider');
  return client;
}
