import { Money } from '@mini-market/shared-kernel';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import equity from '@/locales/es/equity.json';
import { formatMoney } from '@/lib/format/money';
import { createTenantStore } from '@/lib/auth/tenant-store';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT } from '@/test/msw/handlers/access';
import { aMovement, capitalHandlers, capitalReadHandlers } from '@/test/msw/handlers/equity';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';
import { renderWithProviders } from '@/test/render-with-providers';
import { CapitalPage } from './pages/capital-page';

const bs = (centavos: number) => formatMoney(Money.fromCentavos(centavos));
function renderPage() {
  const tenantStore = createTenantStore(null);
  tenantStore.set(OWNER_TENANT.tenantId);
  return renderWithProviders(<CapitalPage />, { tenantStore });
}
const summaryCard = (id: 'contributed' | 'withdrawn' | 'net') =>
  screen.getByTestId(`summary-${id}`);

async function record(kind: 'contribution' | 'withdrawal', amount: string, note = '') {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: equity.record.open }));
  const sheet = await screen.findByRole('dialog');
  await user.click(within(sheet).getByLabelText(equity.kind[kind]));
  await user.type(within(sheet).getByLabelText(equity.record.amount), amount);
  if (note) await user.type(within(sheet).getByLabelText(equity.record.note), note);
  await user.click(within(sheet).getByRole('button', { name: equity.record.submit }));
}

describe('CapitalPage', () => {
  it('shows the totals and the movements of the business', async () => {
    // AC-1
    server.use(
      ...capitalHandlers([
        aMovement({ id: '66666666-6666-4666-8666-666666666601', amountCentavos: 1_000_000 }),
        aMovement({
          id: '66666666-6666-4666-8666-666666666602',
          kind: 'withdrawal',
          amountCentavos: 50_000,
          note: 'retiro de octubre',
        }),
      ]),
    );
    renderPage();

    expect(await screen.findByText(bs(950_000))).toBeInTheDocument();
    expect(within(summaryCard('contributed')).getByText(bs(1_000_000))).toBeInTheDocument();
    expect(within(summaryCard('withdrawn')).getByText(bs(50_000))).toBeInTheDocument();
    expect(await screen.findByText('retiro de octubre')).toBeInTheDocument();
    expect(screen.getByText(`-${bs(50_000)}`)).toBeInTheDocument();
  });

  it('updates the summary after a new contribution is saved', async () => {
    // AC-1
    server.use(...capitalHandlers());
    renderPage();
    expect(await screen.findByText(equity.list.empty)).toBeInTheDocument();
    expect(
      await within(await screen.findByTestId('summary-net')).findByText(bs(0)),
    ).toBeInTheDocument();

    await record('contribution', '1500,50', 'capital inicial');

    expect(await within(summaryCard('contributed')).findByText(bs(150_050))).toBeInTheDocument();
    expect(within(summaryCard('net')).getByText(bs(150_050))).toBeInTheDocument();
    expect(await screen.findByText(`+${bs(150_050)}`)).toBeInTheDocument();
    expect(screen.getByText(equity.record.success)).toBeInTheDocument();
    expect(screen.getByText('capital inicial')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns when a withdrawal leaves the capital below zero, and still records it', async () => {
    // AC-1
    server.use(...capitalHandlers([aMovement({ amountCentavos: 10_000 })]));
    renderPage();
    await screen.findByText(`+${bs(10_000)}`);

    await record('withdrawal', '150');

    expect(await screen.findByText(equity.record.warning)).toBeInTheDocument();
    expect(await within(summaryCard('net')).findByText(bs(-5_000))).toBeInTheDocument();
  });

  it('sends whole centavos to the API, never a decimal', async () => {
    let sent: unknown;
    server.use(
      http.post(apiUrl('/capital/movements'), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'x' }, { status: 500 });
      }),
    );
    renderPage();

    await record('contribution', '19.99');

    expect(await screen.findByRole('alert')).toHaveTextContent(/ocurrió un error en el servidor/i);
    expect(sent).toMatchObject({ kind: 'contribution', amountCentavos: 1999 });
    expect(sent).not.toHaveProperty('note');
  });

  it('asks for a valid amount before calling the API', async () => {
    let posted = false;
    server.use(
      http.post(apiUrl('/capital/movements'), () => {
        posted = true;
        return HttpResponse.json({});
      }),
    );
    renderPage();

    await record('contribution', '12.345');

    expect(await screen.findByText(equity.validation.amountInvalid)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('shows the Spanish error when the movements cannot be loaded', async () => {
    server.use(
      http.get(apiUrl('/capital/movements'), () => HttpResponse.error()),
      http.get(apiUrl('/capital/summary'), () => HttpResponse.error()),
    );
    renderPage();

    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    const retries = screen.getAllByRole('button', { name: equity.list.retry });
    expect(retries).toHaveLength(2); // one for the totals, one for the ledger
    server.use(...capitalReadHandlers([aMovement({ note: 'ya cargó' })]));
    for (const retry of retries) await userEvent.setup().click(retry);
    expect(await screen.findByText('ya cargó')).toBeInTheDocument();
  });
});

describe('/capital route', () => {
  it('sends an employee to the no-permission page', async () => {
    // AC-2
    server.use(
      http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [EMPLOYEE_TENANT] })),
    );
    const app = renderApp({
      path: '/capital',
      session: TEST_USER,
      tenantId: EMPLOYEE_TENANT.tenantId,
    });

    expect(await screen.findByRole('heading', { name: auth.forbidden.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/forbidden');
    expect(screen.queryByText(equity.title)).not.toBeInTheDocument();
  });

  it('opens the screen for the owner', async () => {
    // AC-2
    renderApp({ path: '/capital', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });

    expect(await screen.findByRole('heading', { name: equity.title })).toBeInTheDocument();
  });
});
