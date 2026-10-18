import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { i18n } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ApiClientProvider } from '@/lib/api/api-context';
import type { ApiClient } from '@/lib/api/client';
import type { AuthGateway } from '@/lib/auth/auth-gateway';
import { AuthProvider } from '@/lib/auth/session';
import type { TenantStore } from '@/lib/auth/tenant-store';
import { Toaster } from '@/ui/sonner';

export interface AppProvidersProps {
  readonly queryClient: QueryClient;
  readonly apiClient: ApiClient;
  readonly i18n: i18n;
  readonly gateway: AuthGateway;
  readonly tenantStore: TenantStore;
  readonly children: ReactNode;
}

/** Everything is injected, so tests and the app build the same tree with different parts. */
export function AppProviders({
  queryClient,
  apiClient,
  i18n,
  gateway,
  tenantStore,
  children,
}: AppProvidersProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider gateway={gateway} tenantStore={tenantStore}>
          <ApiClientProvider client={apiClient}>
            {children}
            <Toaster />
          </ApiClientProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
