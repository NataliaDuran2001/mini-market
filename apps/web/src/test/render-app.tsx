import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, type RenderResult } from '@testing-library/react';
import { createAppServices, type AppServices } from '@/app/create-app';
import { AppProviders } from '@/app/providers';
import type { AuthSession } from '@/lib/auth/auth-gateway';
import { createTenantStore, type TenantStore } from '@/lib/auth/tenant-store';
import { env } from '@/lib/env';
import { createFakeAuthGateway, type FakeAuthGateway } from './fake-auth-gateway';

export interface RenderAppOptions {
  /** Initial URL, for example `/` or `/login?redirect=%2Fforbidden`. */
  readonly path?: string;
  /** Signed-in user; omit for an anonymous visitor. */
  readonly session?: AuthSession | null;
  /** Business already selected in the store, as after a previous visit. */
  readonly tenantId?: string;
  readonly gateway?: FakeAuthGateway;
}

export interface RenderedApp extends RenderResult {
  readonly services: AppServices;
  readonly gateway: FakeAuthGateway;
  readonly tenantStore: TenantStore;
}

/** Renders the whole app (real router, route guards, API client) over a fake identity provider. */
export function renderApp(options: RenderAppOptions = {}): RenderedApp {
  const gateway = options.gateway ?? createFakeAuthGateway({ session: options.session ?? null });
  const tenantStore = createTenantStore(null);
  if (options.tenantId) tenantStore.set(options.tenantId);
  const services = createAppServices({
    apiBaseUrl: env.VITE_API_URL,
    gateway,
    tenantStore,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } }),
    history: createMemoryHistory({ initialEntries: [options.path ?? '/'] }),
  });
  const result = render(
    <AppProviders
      queryClient={services.queryClient}
      apiClient={services.apiClient}
      i18n={services.i18n}
      gateway={gateway}
      tenantStore={tenantStore}
    >
      <RouterProvider router={services.router} />
    </AppProviders>,
  );
  return Object.assign(result, { services, gateway, tenantStore });
}
