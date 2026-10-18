import { QueryClient } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { createAppServices } from '@/app/create-app';
import auth from '@/locales/es/auth.json';
import { createTenantStore } from '@/lib/auth/tenant-store';
import { env } from '@/lib/env';
import { createFakeAuthGateway, TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT } from '@/test/msw/handlers/access';
import { server } from '@/test/msw/server';
import { requirePermission, type GuardContext } from './guards';
import { ForbiddenPage } from './pages/forbidden-page';

// No route needs a permission yet (reports arrive in M7), so the guard is exercised on a
// code-based route tree that mirrors how a feature route will use it.
function renderGuardedRoute(tenant: typeof OWNER_TENANT | typeof EMPLOYEE_TENANT) {
  server.use(http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [tenant] })));
  const gateway = createFakeAuthGateway({ session: TEST_USER });
  const tenantStore = createTenantStore(null);
  const services = createAppServices({ apiBaseUrl: env.VITE_API_URL, gateway, tenantStore });
  const context: GuardContext = {
    gateway,
    tenantStore,
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    apiClient: services.apiClient,
  };

  const root = createRootRouteWithContext<GuardContext>()({ component: Outlet });
  const reports = createRoute({
    getParentRoute: () => root,
    path: '/reports',
    beforeLoad: requirePermission('reports.read'),
    component: () => <p>pantalla de reportes</p>,
  });
  const forbidden = createRoute({
    getParentRoute: () => root,
    path: '/forbidden',
    component: ForbiddenPage,
  });
  const router = createRouter({
    routeTree: root.addChildren([reports, forbidden]),
    context,
    history: createMemoryHistory({ initialEntries: ['/reports'] }),
  });
  render(
    <AppProviders
      queryClient={context.queryClient}
      apiClient={services.apiClient}
      i18n={services.i18n}
      gateway={gateway}
      tenantStore={tenantStore}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe('requirePermission', () => {
  it('shows the Spanish "sin permiso" page to an employee, not a blank screen', async () => {
    // AC-4
    const router = renderGuardedRoute(EMPLOYEE_TENANT);
    expect(await screen.findByRole('heading', { name: auth.forbidden.title })).toBeInTheDocument();
    expect(screen.getByText(auth.forbidden.description)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/forbidden');
    expect(screen.queryByText('pantalla de reportes')).not.toBeInTheDocument();
  });

  it('lets the owner into the same route', async () => {
    // AC-4
    renderGuardedRoute(OWNER_TENANT);
    expect(await screen.findByText('pantalla de reportes')).toBeInTheDocument();
  });
});
