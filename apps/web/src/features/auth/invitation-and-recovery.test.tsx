import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import home from '@/locales/es/home.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { OWNER_TENANT } from '@/test/msw/handlers/access';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';

const TOKEN = 'invitation-token-0123456789';
const NEW_PASSWORD = 'a-long-password';

async function fillNewPassword(user: ReturnType<typeof userEvent.setup>, confirm = NEW_PASSWORD) {
  await user.type(await screen.findByLabelText(auth.setPassword.password), NEW_PASSWORD);
  await user.type(screen.getByLabelText(auth.setPassword.confirm), confirm);
}

describe('accept invitation', () => {
  it('sets the password, accepts the invitation and lands in the tenant', async () => {
    // AC-5
    let acceptBody: unknown;
    let acceptTenantHeader: string | null = 'not-called';
    server.use(
      http.post(apiUrl('/invitations/accept'), async ({ request }) => {
        acceptBody = await request.json();
        acceptTenantHeader = request.headers.get('x-tenant-id');
        return HttpResponse.json({ tenantId: OWNER_TENANT.tenantId, role: 'employee' });
      }),
    );
    // The invite link of Supabase has already signed the invitee in when the page opens.
    const app = renderApp({ path: `/accept-invitation?token=${TOKEN}`, session: TEST_USER });
    const user = userEvent.setup();

    await fillNewPassword(user);
    await user.click(screen.getByRole('button', { name: auth.invitation.submit }));

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.gateway.passwordUpdates).toEqual([NEW_PASSWORD]);
    expect(acceptBody).toEqual({ token: TOKEN });
    expect(acceptTenantHeader).toBeNull();
    expect(app.tenantStore.get()).toBe(OWNER_TENANT.tenantId);
    expect(app.services.router.state.location.pathname).toBe('/');
  });

  it('shows the Spanish message for an expired invitation', async () => {
    // AC-5
    server.use(
      http.post(apiUrl('/invitations/accept'), () =>
        HttpResponse.json({ code: 'INVITATION_EXPIRED', message: 'expired' }, { status: 410 }),
      ),
    );
    renderApp({ path: `/accept-invitation?token=${TOKEN}`, session: TEST_USER });
    const user = userEvent.setup();

    await fillNewPassword(user);
    await user.click(screen.getByRole('button', { name: auth.invitation.submit }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      common.errors.codes.INVITATION_EXPIRED,
    );
  });

  it('refuses a link without a valid token', async () => {
    // AC-5
    renderApp({ path: '/accept-invitation?token=short', session: TEST_USER });
    expect(await screen.findByRole('alert')).toHaveTextContent(auth.invitation.invalidLink);
    expect(screen.queryByLabelText(auth.setPassword.password)).not.toBeInTheDocument();
  });

  it('refuses a link whose sign-in did not happen', async () => {
    // AC-5
    renderApp({ path: `/accept-invitation?token=${TOKEN}` });
    expect(await screen.findByRole('alert')).toHaveTextContent(auth.invitation.invalidLink);
  });

  it('requires matching passwords of at least 8 characters', async () => {
    // AC-5
    renderApp({ path: `/accept-invitation?token=${TOKEN}`, session: TEST_USER });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(auth.setPassword.password), 'short');
    await user.type(screen.getByLabelText(auth.setPassword.confirm), 'other');
    await user.click(screen.getByRole('button', { name: auth.invitation.submit }));

    expect(await screen.findByText(auth.validation.passwordTooShort)).toBeInTheDocument();
    expect(screen.getByText(auth.validation.passwordsDontMatch)).toBeInTheDocument();
  });
});

describe('password recovery', () => {
  it('asks for a reset link and never reveals whether the account exists', async () => {
    const app = renderApp({ path: '/forgot-password' });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(auth.login.email), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: auth.forgot.submit }));

    expect(await screen.findByText(auth.forgot.sent)).toBeInTheDocument();
    expect(app.gateway.resetRequests).toEqual([
      {
        email: 'nobody@example.com',
        redirectTo: `${window.location.origin}/reset-password`,
      },
    ]);
  });

  it('sets the new password from the recovery link and signs in', async () => {
    const app = renderApp({ path: '/reset-password', session: TEST_USER });
    const user = userEvent.setup();

    await fillNewPassword(user);
    await user.click(screen.getByRole('button', { name: auth.reset.submit }));

    expect(await screen.findByRole('heading', { name: home.title })).toBeInTheDocument();
    expect(app.gateway.passwordUpdates).toEqual([NEW_PASSWORD]);
  });

  it('explains that an expired link is no longer valid', async () => {
    renderApp({ path: '/reset-password' });
    expect(await screen.findByRole('alert')).toHaveTextContent(auth.reset.invalidLink);
    await waitFor(() => {
      expect(screen.getByRole('link', { name: auth.reset.requestAnother })).toBeInTheDocument();
    });
  });
});
