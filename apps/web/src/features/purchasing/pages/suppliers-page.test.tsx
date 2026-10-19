import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { createTenantStore } from '@/lib/auth/tenant-store';
import purchasing from '@/locales/es/purchasing.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT } from '@/test/msw/handlers/access';
import { aSupplier, suppliersApi } from '@/test/msw/handlers/purchasing';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';
import { renderWithProviders } from '@/test/render-with-providers';
import { useSuppliers } from '../api/use-suppliers';
import { SuppliersPage } from './suppliers-page';

const t = purchasing.suppliers;

/** Stands in for the supplier picker of the purchase screen: the active suppliers, by name. */
function PickerProbe() {
  const { data } = useSuppliers({ active: true });
  return (
    <ul aria-label="picker">
      {(data?.items ?? []).map((supplier) => (
        <li key={supplier.id}>{supplier.name}</li>
      ))}
    </ul>
  );
}

async function openPage(role: 'owner' | 'employee' = 'owner') {
  if (role === 'employee') {
    server.use(
      http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [EMPLOYEE_TENANT] })),
    );
  }
  const app = renderApp({
    path: '/compras/proveedores',
    session: TEST_USER,
    tenantId: OWNER_TENANT.tenantId,
  });
  await screen.findByRole('heading', { name: t.title });
  return app;
}

async function fillAndSave(user: ReturnType<typeof userEvent.setup>, name: string) {
  const sheet = await screen.findByRole('dialog');
  await user.type(within(sheet).getByLabelText(purchasing.suppliers.form.name), name);
  await user.click(within(sheet).getByRole('button', { name: t.form.save }));
}

describe('suppliers page', () => {
  it('lists the suppliers and filters them by the search text', async () => {
    const api = suppliersApi([aSupplier({ name: 'Alfa' }), aSupplier({ name: 'Beta' })]);
    server.use(...api.handlers);
    const user = userEvent.setup();
    await openPage();

    expect(await screen.findByText('Alfa')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: t.search }), 'alf');

    await waitFor(() => expect(screen.queryByText('Beta')).not.toBeInTheDocument());
    expect(screen.getByText('Alfa')).toBeInTheDocument();
  });

  it('shows the Spanish empty state when there are no suppliers', async () => {
    await openPage();
    expect(await screen.findByText(new RegExp(t.empty))).toBeInTheDocument();
  });

  it('shows the new supplier in the purchase screen picker after saving the form', async () => {
    // AC-1
    const api = suppliersApi();
    server.use(...api.handlers);
    const user = userEvent.setup();
    const tenantStore = createTenantStore(null);
    tenantStore.set(OWNER_TENANT.tenantId);
    renderWithProviders(
      <>
        <SuppliersPage />
        <PickerProbe />
      </>,
      { tenantStore },
    );
    await user.click(await screen.findByRole('button', { name: t.new }));

    await fillAndSave(user, 'Distribuidora Sur');

    const picker = screen.getByRole('list', { name: 'picker' });
    expect(await within(picker).findByText('Distribuidora Sur')).toBeInTheDocument();
    expect(api.suppliers.map((supplier) => supplier.name)).toEqual(['Distribuidora Sur']);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a Spanish error under the name when it is already taken', async () => {
    // AC-2
    server.use(...suppliersApi([aSupplier({ name: 'Distribuidora Sur' })]).handlers);
    const user = userEvent.setup();
    await openPage();
    await user.click(await screen.findByRole('button', { name: t.new }));

    await fillAndSave(user, 'distribuidora sur');

    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(purchasing.errors.SUPPLIER_NAME_TAKEN)).toBeVisible();
    expect(sheet).toBeInTheDocument();
  });

  it('rejects a blank name before calling the API', async () => {
    const api = suppliersApi();
    server.use(...api.handlers);
    const user = userEvent.setup();
    await openPage();
    await user.click(await screen.findByRole('button', { name: t.new }));

    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: t.form.save }),
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(api.suppliers).toHaveLength(0);
  });

  it('edits a supplier with its current values and saves the change', async () => {
    const api = suppliersApi([aSupplier({ name: 'Alfa', phone: '70011223' })]);
    server.use(...api.handlers);
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole('button', { name: `Editar Alfa` }));
    const sheet = await screen.findByRole('dialog');
    const phone = within(sheet).getByLabelText(t.form.phone);
    expect(phone).toHaveValue('70011223');
    await user.clear(phone);
    await user.type(phone, '77700000');
    await user.click(within(sheet).getByRole('button', { name: t.form.save }));

    await waitFor(() => expect(api.suppliers[0]?.phone).toBe('77700000'));
    expect(await screen.findByText('77700000')).toBeInTheDocument();
  });

  it('switches a supplier off and on without deleting it', async () => {
    const api = suppliersApi([aSupplier({ name: 'Alfa' })]);
    server.use(...api.handlers);
    const user = userEvent.setup();
    await openPage();

    await user.click(await screen.findByRole('button', { name: 'Desactivar Alfa' }));
    expect(await screen.findByText(t.inactive)).toBeInTheDocument();
    expect(api.suppliers[0]?.active).toBe(false);

    await user.click(await screen.findByRole('button', { name: 'Activar Alfa' }));
    await waitFor(() => expect(screen.queryByText(t.inactive)).not.toBeInTheDocument());
    expect(api.suppliers[0]?.active).toBe(true);
  });

  it('gives an employee a read-only list: no create, edit or activate control', async () => {
    // AC-3
    server.use(...suppliersApi([aSupplier({ name: 'Alfa' })]).handlers);
    await openPage('employee');

    expect(await screen.findByText('Alfa')).toBeInTheDocument();
    expect(screen.getByText(t.readOnly)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.new })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Desactivar|Activar)/ })).not.toBeInTheDocument();
  });

  it('shows the Spanish load error with a retry', async () => {
    server.use(http.get(apiUrl('/suppliers'), () => HttpResponse.json({}, { status: 500 })));
    await openPage();
    expect(await screen.findByText(t.loadError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.retry })).toBeInTheDocument();
  });
});
