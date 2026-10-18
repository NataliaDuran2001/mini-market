import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { tenantKey } from '@/lib/api/query-keys';
import home from '@/locales/es/home.json';
import shell from '@/locales/es/shell.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT, SECOND_TENANT } from '@/test/msw/handlers/access';
import { aTenant } from '@/test/msw/handlers/tenancy';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';

async function renderShell(options: Parameters<typeof renderApp>[0] = {}) {
  const app = renderApp({ path: '/', session: TEST_USER, ...options });
  await screen.findByRole('heading', { name: home.title });
  // The menu waits for the tenant settings (modules) and the role.
  await waitFor(() => {
    expect(screen.getByTestId('tenant-name')).not.toHaveTextContent(shell.header.tenantLoading);
  });
  return app;
}

const sidebar = () => within(screen.getByRole('navigation', { name: shell.nav.secondary }));
const tabBar = () => within(screen.getByRole('navigation', { name: shell.nav.primary }));

describe('navigation by enabled modules', () => {
  it('shows Fiado / Clientes when credit_sales is on', async () => {
    // AC-1
    await renderShell();
    await waitFor(() => {
      expect(sidebar().getByRole('link', { name: shell.nav.customers })).toBeInTheDocument();
    });
  });

  it('has no Fiado / Clientes entry when credit_sales is off', async () => {
    // AC-1
    server.use(
      http.get(apiUrl('/tenant'), () =>
        HttpResponse.json(aTenant(OWNER_TENANT, { modules: { credit_sales: false } })),
      ),
    );
    const user = userEvent.setup();
    await renderShell();

    expect(sidebar().queryByRole('link', { name: shell.nav.customers })).not.toBeInTheDocument();
    await user.click(tabBar().getByRole('button', { name: shell.nav.more }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: shell.nav.customers })).not.toBeInTheDocument();
  });
});

describe('navigation by role', () => {
  it('shows Reportes, Capital and Configuración to the owner', async () => {
    // AC-2
    await renderShell();
    for (const label of [shell.nav.reports, shell.nav.capital, shell.nav.settings]) {
      expect(sidebar().getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('hides Reportes, Capital and Configuración from an employee', async () => {
    // AC-2
    server.use(
      http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [EMPLOYEE_TENANT] })),
    );
    await renderShell();

    for (const label of [
      shell.nav.reports,
      shell.nav.capital,
      shell.nav.settings,
      shell.nav.expenses,
    ]) {
      expect(sidebar().queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
    for (const label of [shell.nav.sales, shell.nav.products, shell.nav.purchases]) {
      expect(sidebar().getByRole('link', { name: label })).toBeInTheDocument();
    }
  });
});

describe('tenant switcher', () => {
  it('invalidates the queries and shows the new tenant in the header', async () => {
    // AC-3
    server.use(
      http.get(apiUrl('/me/tenants'), () =>
        HttpResponse.json({ items: [OWNER_TENANT, SECOND_TENANT] }),
      ),
    );
    const requestedTenants: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/tenant'), ({ request }) => {
        const id = request.headers.get('x-tenant-id');
        requestedTenants.push(id);
        return HttpResponse.json(
          aTenant(id === SECOND_TENANT.tenantId ? SECOND_TENANT : OWNER_TENANT),
        );
      }),
    );
    const user = userEvent.setup();
    const app = await renderShell({ tenantId: OWNER_TENANT.tenantId });
    expect(screen.getByTestId('tenant-name')).toHaveTextContent(OWNER_TENANT.name);

    await user.click(screen.getByRole('button', { name: shell.header.account }));
    await user.click(await screen.findByRole('button', { name: SECOND_TENANT.name }));

    await waitFor(() => {
      expect(screen.getByTestId('tenant-name')).toHaveTextContent(SECOND_TENANT.name);
    });
    expect(app.tenantStore.get()).toBe(SECOND_TENANT.tenantId);
    expect(
      app.services.queryClient.getQueryState(tenantKey(OWNER_TENANT.tenantId, 'settings'))
        ?.isInvalidated,
    ).toBe(true);
    await waitFor(() => {
      expect(requestedTenants).toContain(SECOND_TENANT.tenantId);
    });
  });

  it('keeps the caches of two tenants apart', () => {
    // AC-3
    const cache = new QueryClient();
    cache.setQueryData(tenantKey('a', 'settings'), 'A');
    cache.setQueryData(tenantKey('b', 'settings'), 'B');
    expect(cache.getQueryData(tenantKey('a', 'settings'))).toBe('A');
    expect(cache.getQueryData(tenantKey('b', 'settings'))).toBe('B');
  });

  it('offers no switch when the person has a single business', async () => {
    // AC-3
    const user = userEvent.setup();
    await renderShell();
    await user.click(screen.getByRole('button', { name: shell.header.account }));
    expect(await screen.findByText(`Sesión iniciada como ${TEST_USER.email}`)).toBeInTheDocument();
    expect(screen.queryByText(shell.header.switchTenant)).not.toBeInTheDocument();
  });
});

describe('mobile layout', () => {
  it('has a bottom tab bar within thumb reach: Vender, Productos, Compras and Más', async () => {
    // AC-4: jsdom has no layout engine; the measured check at 400px is recorded in the PR.
    await renderShell();
    const nav = screen.getByRole('navigation', { name: shell.nav.primary });
    expect(nav.className).toContain('fixed inset-x-0 bottom-0');
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(nav.className).toContain('lg:hidden');
    const entries = [...nav.querySelectorAll('a, button')].map((el) => el.textContent);
    expect(entries).toEqual([
      shell.nav.sales,
      shell.nav.products,
      shell.nav.purchases,
      shell.nav.more,
    ]);
    for (const el of nav.querySelectorAll('a, button')) {
      expect(el.className).toContain('min-h-14');
    }
  });

  it('shows the sidebar only from 1024px', async () => {
    // AC-4
    await renderShell();
    const aside = screen.getByRole('navigation', { name: shell.nav.secondary }).closest('aside');
    expect(aside?.className).toContain('hidden lg:block');
  });

  it('opens the rest of the sections behind Más', async () => {
    // AC-4
    const user = userEvent.setup();
    await renderShell();
    await user.click(tabBar().getByRole('button', { name: shell.nav.more }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: shell.nav.reports })).toBeInTheDocument();
  });
});

describe('dashboard', () => {
  it('lists a shortcut to every section the person may use', async () => {
    await renderShell();
    const shortcuts = screen.getByRole('region', { name: shell.dashboard.shortcuts });
    expect(within(shortcuts).getByRole('link', { name: shell.nav.sales })).toBeInTheDocument();
    expect(within(shortcuts).getByText(shell.dashboard.empty)).toBeInTheDocument();
  });
});
