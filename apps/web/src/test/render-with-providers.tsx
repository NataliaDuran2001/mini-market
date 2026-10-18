import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { i18n } from 'i18next';
import type { ReactElement } from 'react';
import { AppProviders } from '@/app/providers';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import type { AuthGateway } from '@/lib/auth/auth-gateway';
import { createTenantStore, type TenantStore } from '@/lib/auth/tenant-store';
import { env } from '@/lib/env';
import { createI18n } from '@/lib/i18n/create-i18n';
import { createFakeAuthGateway, TEST_USER } from './fake-auth-gateway';

export interface RenderWithProvidersOptions {
  readonly queryClient?: QueryClient;
  readonly apiClient?: ApiClient;
  readonly i18n?: i18n;
  /** Defaults to a signed-in fake. */
  readonly gateway?: AuthGateway;
  /** Defaults to an in-memory store without a selected business. */
  readonly tenantStore?: TenantStore;
}

/**
 * Renders `ui` with the same providers as the app (Query, API client, Spanish i18n, auth, toaster).
 * Each call gets a fresh QueryClient without retries, so tests never share cache.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult {
  const queryClient =
    options.queryClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const apiClient = options.apiClient ?? createApiClient({ baseUrl: env.VITE_API_URL });
  const instance = options.i18n ?? createI18n();
  const gateway = options.gateway ?? createFakeAuthGateway({ session: TEST_USER });
  const tenantStore = options.tenantStore ?? createTenantStore(null);
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders
        queryClient={queryClient}
        apiClient={apiClient}
        i18n={instance}
        gateway={gateway}
        tenantStore={tenantStore}
      >
        {children}
      </AppProviders>
    ),
  });
}
