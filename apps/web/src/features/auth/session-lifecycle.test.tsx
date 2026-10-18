import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import home from '@/locales/es/home.json';
import { createFakeAuthGateway, TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { OWNER_TENANT, SECOND_TENANT } from '@/test/msw/handlers/access';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';
import { MY_TENANTS_KEY } from './api/my-tenants';

describe('session lifecycle', () => {
  it('returns to the exact original URL after a 401 while loading the tenants', async () => {
    // AC-3 (#14)
    let calls = 0;
    server.use(
      http.get(apiUrl('/me/tenants'), () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'expired' }, { status: 401 })
          : HttpResponse.json({ items: [OWNER_TENANT] });
      }),
    );
    const app = renderApp({ path: '/?from=report', session: TEST_USER });
    const user = userEvent.setup();

    expect(await screen.findByLabelText(auth.login.email)).toBeInTheDocument();
    expect(app.services.router.state.location.search).toMatchObject({
      redirect: '/?from=report',
    });

    await user.type(screen.getByLabelText(auth.login.email), TEST_USER.email);
    await user.type(screen.getByLabelText(auth.login.password), 'correct-horse');
    await user.click(screen.getByRole('button', { name: auth.login.submit }));

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.services.router.state.location.href).toBe('/?from=report');
  });

  it('forgets the previous person when the session ends outside the app', async () => {
    // AC-3 (#14): another tab signs out, or the refresh token fails
    const app = renderApp({ path: '/', session: TEST_USER });
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.services.queryClient.getQueryData(MY_TENANTS_KEY)).toBeDefined();
    expect(app.tenantStore.get()).toBe(OWNER_TENANT.tenantId);

    act(() => {
      app.gateway.expireSession();
    });

    await waitFor(() => {
      expect(app.tenantStore.get()).toBeNull();
    });
    expect(app.services.queryClient.getQueryData(MY_TENANTS_KEY)).toBeUndefined();
  });

  it('does not show the businesses of the previous user to the next one', async () => {
    // AC-3 (#14)
    const app = renderApp({ path: '/', session: TEST_USER });
    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    act(() => {
      app.gateway.expireSession();
    });
    server.use(
      http.get(apiUrl('/me/tenants'), () =>
        HttpResponse.json({ items: [OWNER_TENANT, SECOND_TENANT] }),
      ),
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(auth.login.email), TEST_USER.email);
    await user.type(screen.getByLabelText(auth.login.password), 'correct-horse');
    await user.click(screen.getByRole('button', { name: auth.login.submit }));

    expect(
      await screen.findByRole('heading', { name: auth.selectTenant.title }),
    ).toBeInTheDocument();
  });

  it('shows a Spanish error page with a retry when the tenants cannot be loaded', async () => {
    server.use(
      http.get(apiUrl('/me/tenants'), () =>
        HttpResponse.json({ code: 'IDENTITY_PROVIDER_UNAVAILABLE', message: 'x' }, { status: 503 }),
      ),
    );
    renderApp({ path: '/', session: TEST_USER });

    expect(await screen.findByRole('alert')).toHaveTextContent(common.routeError.title);
    expect(screen.getByRole('alert')).toHaveTextContent(
      common.errors.codes.IDENTITY_PROVIDER_UNAVAILABLE,
    );
    expect(screen.getByRole('button', { name: common.routeError.retry })).toBeInTheDocument();
  });

  it('shows a Spanish toast when the API answers 403', async () => {
    // Scope (#14): 403 shows a toast
    server.use(
      http.get(apiUrl('/health'), () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'x' }, { status: 403 }),
      ),
    );
    renderApp({ path: '/', session: TEST_USER });

    expect(await screen.findByText(common.errors.forbiddenToast)).toBeInTheDocument();
  });

  it('shows the same answer to a password reset whether or not the address exists', async () => {
    // AC-2 (#14): no account enumeration, not even through rate limiting
    const gateway = {
      ...createFakeAuthGateway(),
      requestPasswordReset: () => Promise.resolve({ ok: false, code: 'RATE_LIMITED' } as const),
    };
    renderApp({ path: '/forgot-password', gateway });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(auth.login.email), 'ana@example.com');
    await user.click(screen.getByRole('button', { name: auth.forgot.submit }));

    expect(await screen.findByText(auth.forgot.sent)).toBeInTheDocument();
  });
});
