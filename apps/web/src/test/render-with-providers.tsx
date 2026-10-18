import { QueryClient } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { i18n } from 'i18next';
import type { ReactElement } from 'react';
import { AppProviders } from '@/app/providers';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import { env } from '@/lib/env';
import { createI18n } from '@/lib/i18n/create-i18n';

export interface RenderWithProvidersOptions {
  readonly queryClient?: QueryClient;
  readonly apiClient?: ApiClient;
  readonly i18n?: i18n;
}

/**
 * Renders `ui` with the same providers as the app (Query, API client, Spanish i18n, toaster).
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
  return render(ui, {
    wrapper: ({ children }) => (
      <AppProviders queryClient={queryClient} apiClient={apiClient} i18n={instance}>
        {children}
      </AppProviders>
    ),
  });
}
