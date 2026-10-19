import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import settings from '@/locales/es/settings.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT, SECOND_TENANT } from '@/test/msw/handlers/access';
import { tenantSettingsApi } from '@/test/msw/handlers/settings';
import { aTenant } from '@/test/msw/handlers/tenancy';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';

const pharmacy = () => {
  const tenant = aTenant(SECOND_TENANT, {
    modules: { lots: true, fractional: true, credit_sales: true, custom_fields: false },
  });
  return { ...tenant, settings: { ...tenant.settings, vertical: 'farmacia' as const } };
};

async function openSettings() {
  const api = tenantSettingsApi(pharmacy());
  server.use(...api.handlers);
  renderApp({ path: '/settings', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });
  await screen.findByRole('heading', { name: settings.title, level: 1 });
  return api;
}

const moduleRow = (module: string) => {
  const row = document.querySelector<HTMLElement>(`[data-module="${module}"]`);
  if (!row) throw new Error(`no row for ${module}`);
  return within(row);
};

describe('/settings', () => {
  it('shows the modules of the pharmacy preset read only', async () => {
    // AC-4
    await openSettings();

    expect(await screen.findByText(settings.vertical.farmacia)).toBeInTheDocument();
    expect(moduleRow('lots').getByText(settings.modules.on)).toBeInTheDocument();
    expect(moduleRow('fractional').getByText(settings.modules.on)).toBeInTheDocument();
    expect(moduleRow('credit_sales').getByText(settings.modules.on)).toBeInTheDocument();
    expect(moduleRow('custom_fields').getByText(settings.modules.off)).toBeInTheDocument();
    for (const module of ['lots', 'fractional', 'credit_sales', 'custom_fields']) {
      expect(moduleRow(module).queryByRole('checkbox')).not.toBeInTheDocument();
      expect(moduleRow(module).queryByRole('button')).not.toBeInTheDocument();
    }
    expect(screen.getByText('America/La_Paz')).toBeInTheDocument();
    expect(screen.getByText(settings.currency.BOB)).toBeInTheDocument();
  });

  it('saves a change of the two owner flags', async () => {
    // AC-4
    const api = await openSettings();
    const user = userEvent.setup();
    const negative = await screen.findByRole('checkbox', {
      name: new RegExp(settings.flags.allowNegativeStock.label),
    });
    expect(negative).not.toBeChecked();

    await user.click(negative);

    await waitFor(() => expect(api.tenant().settings.allowNegativeStock).toBe(true));
    expect(await screen.findByText(settings.flags.saved)).toBeInTheDocument();
    expect(negative).toBeChecked();
    expect(api.tenant().settings.employeeCanVoid).toBe(false);
    expect(api.tenant().settings.modules.lots).toBe(true);
  });

  it('sends an employee to the no-permission page', async () => {
    // AC-4
    server.use(
      http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [EMPLOYEE_TENANT] })),
    );
    const app = renderApp({
      path: '/settings',
      session: TEST_USER,
      tenantId: EMPLOYEE_TENANT.tenantId,
    });

    expect(await screen.findByRole('heading', { name: auth.forbidden.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/forbidden');
  });

  it('shows a Spanish message when a flag cannot be saved', async () => {
    // AC-5
    const api = await openSettings();
    server.use(
      http.patch(apiUrl('/tenant/settings'), () =>
        HttpResponse.json(
          { code: 'FORBIDDEN', message: 'Only the owner can change tenant settings' },
          { status: 403 },
        ),
      ),
    );
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', {
        name: new RegExp(settings.flags.employeeCanVoid.label),
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(common.errors.codes.FORBIDDEN);
    expect(screen.queryByText(/Only the owner/)).not.toBeInTheDocument();
    expect(api.tenant().settings.employeeCanVoid).toBe(false);
  });

  it('shows a Spanish message when the settings cannot be loaded', async () => {
    // AC-5
    server.use(
      http.get(apiUrl('/tenant'), () =>
        HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 }),
      ),
    );
    renderApp({ path: '/settings', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });

    expect(await screen.findByRole('alert')).toHaveTextContent(common.errors.codes.INTERNAL_ERROR);
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
