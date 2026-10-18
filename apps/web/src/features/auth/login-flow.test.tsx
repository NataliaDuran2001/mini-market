import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import home from '@/locales/es/home.json';
import shell from '@/locales/es/shell.json';
import { TEST_ACCESS_TOKEN, TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { OWNER_TENANT, SECOND_TENANT } from '@/test/msw/handlers/access';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';

const PASSWORD = 'correct-horse';

async function signIn(user: ReturnType<typeof userEvent.setup>, password = PASSWORD) {
  await user.type(await screen.findByLabelText(auth.login.email), TEST_USER.email);
  await user.type(screen.getByLabelText(auth.login.password), password);
  await user.click(screen.getByRole('button', { name: auth.login.submit }));
}

describe('login', () => {
  it('lands on / with the tenant selected and sends X-Tenant-Id to the API', async () => {
    // AC-1: the layout is phone first (390px); the 400px viewport has no horizontal scroll check
    // here because jsdom has no layout, see the root layout test and the PR evidence.
    const headers: Headers[] = [];
    server.use(
      http.get(apiUrl('/health'), ({ request }) => {
        headers.push(request.headers);
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const app = renderApp({ path: '/login' });
    const user = userEvent.setup();

    await signIn(user);

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/');
    expect(app.tenantStore.get()).toBe(OWNER_TENANT.tenantId);
    await waitFor(() => {
      expect(headers.at(-1)?.get('x-tenant-id')).toBe(OWNER_TENANT.tenantId);
    });
    expect(headers.at(-1)?.get('authorization')).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });

  it('shows an inline Spanish error and does not navigate on wrong credentials', async () => {
    // AC-2
    const app = renderApp({ path: '/login' });
    const user = userEvent.setup();

    await signIn(user, 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(auth.errors.INVALID_CREDENTIALS);
    expect(app.services.router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: home.title })).not.toBeInTheDocument();
  });

  it('validates the form in Spanish before calling the provider', async () => {
    // AC-2
    renderApp({ path: '/login' });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: auth.login.submit }));

    expect(await screen.findByText(auth.validation.emailRequired)).toBeInTheDocument();
    expect(screen.getByText(auth.validation.passwordRequired)).toBeInTheDocument();
  });

  it('returns to the original route after logging in again', async () => {
    // AC-3: an anonymous visitor to a protected route is sent to /login and brought back
    const app = renderApp({ path: '/forbidden' });
    const user = userEvent.setup();

    await signIn(user);

    expect(await screen.findByRole('heading', { name: auth.forbidden.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/forbidden');
  });

  it('ignores a redirect that points to another site', async () => {
    // AC-3 (open redirect protection)
    const app = renderApp({ path: '/login?redirect=https%3A%2F%2Fevil.example%2F' });
    const user = userEvent.setup();

    await signIn(user);

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/');
  });
});

describe('session expiry', () => {
  it('redirects to /login on a 401 and returns to the route after signing in again', async () => {
    // AC-3
    let calls = 0;
    server.use(
      http.get(apiUrl('/health'), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'expired' }, { status: 401 })
          : HttpResponse.json({ status: 'ok' });
      }),
    );
    const app = renderApp({ path: '/', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });

    expect(await screen.findByLabelText(auth.login.email)).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/login');
    expect(app.services.router.state.location.search).toMatchObject({ redirect: '/' });

    await signIn(userEvent.setup());

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/');
  });
});

describe('tenant selection', () => {
  it('selects the only business automatically', async () => {
    // AC-1
    const app = renderApp({ path: '/', session: TEST_USER });
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.tenantStore.get()).toBe(OWNER_TENANT.tenantId);
  });

  it('asks which business to use when there are several, and remembers the choice', async () => {
    // AC-1
    server.use(
      http.get(apiUrl('/me/tenants'), () =>
        HttpResponse.json({ items: [OWNER_TENANT, SECOND_TENANT] }),
      ),
    );
    const app = renderApp({ path: '/', session: TEST_USER });
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: auth.selectTenant.title }),
    ).toBeInTheDocument();
    expect(app.tenantStore.get()).toBeNull();

    await user.click(screen.getByRole('button', { name: new RegExp(SECOND_TENANT.name) }));

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.tenantStore.get()).toBe(SECOND_TENANT.tenantId);
  });

  it('keeps a previously selected business when it is still a membership', async () => {
    // AC-1
    server.use(
      http.get(apiUrl('/me/tenants'), () =>
        HttpResponse.json({ items: [OWNER_TENANT, SECOND_TENANT] }),
      ),
    );
    const app = renderApp({ path: '/', session: TEST_USER, tenantId: SECOND_TENANT.tenantId });
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.tenantStore.get()).toBe(SECOND_TENANT.tenantId);
  });

  it('explains that the account has no business when the list is empty', async () => {
    server.use(http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [] })));
    renderApp({ path: '/', session: TEST_USER });
    expect(await screen.findByText(auth.selectTenant.empty)).toBeInTheDocument();
  });
});

describe('logout', () => {
  it('ends the session, forgets the business and shows the login page', async () => {
    // Scope (#14): logout
    const app = renderApp({ path: '/', session: TEST_USER });
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: shell.header.account }));
    await user.click(await screen.findByRole('button', { name: auth.logout }));

    expect(await screen.findByLabelText(auth.login.email)).toBeInTheDocument();
    expect(app.tenantStore.get()).toBeNull();
    expect(await app.gateway.getSession()).toBeNull();
  });
});
