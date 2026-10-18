import type { QueryClient } from '@tanstack/react-query';
import type { RouterHistory } from '@tanstack/react-router';
import type { i18n } from 'i18next';
import { createApiClient, type ApiClient } from '@/lib/api/client';
import type { AuthGateway } from '@/lib/auth/auth-gateway';
import type { TenantStore } from '@/lib/auth/tenant-store';
import { createI18n } from '@/lib/i18n/create-i18n';
import { createQueryClient } from '@/lib/query-client';
import { toast } from '@/ui/sonner';
import { createAppRouter, type AppRouter } from './router';

export interface AppServicesOptions {
  readonly apiBaseUrl: string;
  readonly gateway: AuthGateway;
  readonly tenantStore: TenantStore;
  readonly queryClient?: QueryClient;
  readonly i18n?: i18n;
  readonly history?: RouterHistory;
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
}

export interface AppServices {
  readonly router: AppRouter;
  readonly queryClient: QueryClient;
  readonly apiClient: ApiClient;
  readonly i18n: i18n;
  readonly gateway: AuthGateway;
  readonly tenantStore: TenantStore;
}

/**
 * Wires the app: the API client sends the token and the tenant, a 401 ends the session and sends
 * the person to /login (they return to where they were after signing in), a 403 shows a toast.
 */
export function createAppServices(options: AppServicesOptions): AppServices {
  const { gateway, tenantStore } = options;
  const queryClient = options.queryClient ?? createQueryClient();
  const instance = options.i18n ?? createI18n();
  // The API client needs the router (to redirect on 401) and the router needs the client.
  const wiring: { router?: AppRouter } = {};
  let signingOut = false;

  const handleUnauthorized = () => {
    if (signingOut || !wiring.router) return;
    signingOut = true;
    const current = wiring.router;
    void (async () => {
      try {
        await gateway.signOut();
        queryClient.clear();
        if (current.state.location.pathname !== '/login') {
          await current.navigate({
            to: '/login',
            search: { redirect: current.state.location.href },
          });
        }
      } finally {
        signingOut = false;
      }
    })();
  };

  const apiClient = createApiClient({
    baseUrl: options.apiBaseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    getHeaders: async ({ withTenant }) => {
      const token = await gateway.getAccessToken();
      const tenantId = tenantStore.get();
      return {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(withTenant && tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      };
    },
    onUnauthorized: handleUnauthorized,
    onForbidden: () => {
      toast.error(instance.t('errors.forbiddenToast', { ns: 'common' }));
    },
  });

  const router = createAppRouter({
    context: { gateway, tenantStore, queryClient, apiClient },
    ...(options.history ? { history: options.history } : {}),
  });

  wiring.router = router;

  return { router, queryClient, apiClient, i18n: instance, gateway, tenantStore };
}
