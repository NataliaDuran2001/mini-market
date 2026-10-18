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

/** `Authorization` and `X-Tenant-Id` for every API call (never cookies). */
function createHeaderProvider(gateway: AuthGateway, tenantStore: TenantStore) {
  return async ({ withTenant }: { readonly withTenant: boolean }) => {
    const token = await gateway.getAccessToken();
    const tenantId = tenantStore.get();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(withTenant && tenantId ? { 'X-Tenant-Id': tenantId } : {}),
    };
  };
}

/**
 * Whatever ends the session (logout, a 401, another tab, a failed token refresh), and whenever a
 * different person signs in, nothing of the previous person may stay: cached queries and the
 * selected business are dropped.
 */
function forgetPreviousUser(deps: {
  gateway: AuthGateway;
  queryClient: QueryClient;
  tenantStore: TenantStore;
  getRouter: () => AppRouter | undefined;
}): void {
  let knownUserId: string | null = null;
  void deps.gateway
    .getSession()
    .then((session) => {
      knownUserId ??= session?.userId ?? null;
    })
    .catch(() => undefined);
  deps.gateway.onSessionChange((session) => {
    const userId = session?.userId ?? null;
    const changed = userId === null || (knownUserId !== null && knownUserId !== userId);
    knownUserId = userId;
    if (!changed) return;
    deps.queryClient.clear();
    deps.tenantStore.clear();
    // Re-run the route guards: a protected screen sends the person to /login, public ones stay.
    if (userId === null) void deps.getRouter()?.invalidate();
  });
}

/** A 401 ends the session and sends the person to /login, bringing them back afterwards. */
function createUnauthorizedHandler(deps: {
  gateway: AuthGateway;
  getRouter: () => AppRouter | undefined;
}) {
  let handling = false;
  return () => {
    const router = deps.getRouter();
    if (handling || !router) return;
    handling = true;
    void (async () => {
      try {
        await deps.gateway.signOut();
        if (router.state.location.pathname !== '/login') {
          await router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
        }
      } finally {
        handling = false;
      }
    })();
  };
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

  forgetPreviousUser({ gateway, queryClient, tenantStore, getRouter: () => wiring.router });

  const apiClient = createApiClient({
    baseUrl: options.apiBaseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    getHeaders: createHeaderProvider(gateway, tenantStore),
    onUnauthorized: createUnauthorizedHandler({ gateway, getRouter: () => wiring.router }),
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
