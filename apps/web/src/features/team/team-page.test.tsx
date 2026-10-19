import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { filterNavigation } from '@/app/navigation/filter-navigation';
import { NAVIGATION } from '@/app/navigation/registry';
import { can } from '@/features/auth';
import auth from '@/locales/es/auth.json';
import common from '@/locales/es/common.json';
import team from '@/locales/es/team.json';
import { TEST_USER } from '@/test/fake-auth-gateway';
import { apiUrl } from '@/test/msw/api-url';
import { EMPLOYEE_TENANT, OWNER_TENANT } from '@/test/msw/handlers/access';
import { aMember, anInvitation, teamApi } from '@/test/msw/handlers/team';
import { server } from '@/test/msw/server';
import { renderApp } from '@/test/render-app';

const OWNER_EMAIL = 'dueno@example.com';
const owner = aMember({ userId: TEST_USER.userId, email: OWNER_EMAIL, role: 'owner' });

async function openTeam(api: ReturnType<typeof teamApi>) {
  server.use(...api.handlers);
  const app = renderApp({ path: '/team', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });
  await screen.findByRole('heading', { name: team.title, level: 1 });
  return app;
}

const memberRow = (email: string) => {
  const row = screen.getByText(email).closest('li');
  if (!row) throw new Error(`no row for ${email}`);
  return within(row);
};

describe('/team members list', () => {
  it('lists the members with role and state to the owner', async () => {
    // AC-1
    const ana = aMember({ email: 'ana@example.com' });
    const luis = aMember({ email: 'luis@example.com', status: 'disabled' });
    await openTeam(teamApi({ members: [owner, ana, luis] }));

    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    expect(memberRow(OWNER_EMAIL).getByText(team.role.owner)).toBeInTheDocument();
    expect(memberRow(OWNER_EMAIL).getByText(team.status.active)).toBeInTheDocument();
    expect(memberRow('ana@example.com').getByText(team.role.employee)).toBeInTheDocument();
    expect(memberRow('ana@example.com').getByText(team.status.active)).toBeInTheDocument();
    expect(memberRow('luis@example.com').getByText(team.status.disabled)).toBeInTheDocument();
  });

  it('sends an employee to the no-permission page and offers no menu entry', async () => {
    // AC-1
    server.use(
      http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [EMPLOYEE_TENANT] })),
    );
    const app = renderApp({
      path: '/team',
      session: TEST_USER,
      tenantId: EMPLOYEE_TENANT.tenantId,
    });

    expect(await screen.findByRole('heading', { name: auth.forbidden.title })).toBeInTheDocument();
    expect(app.services.router.state.location.pathname).toBe('/forbidden');
    const entries = filterNavigation(NAVIGATION, {
      can: (permission) => can('employee', permission),
      modules: undefined,
    }).map((entry) => entry.id);
    expect(entries).not.toContain('team');
    expect(entries).not.toContain('settings');
  });

  it('does not offer to disable the signed-in person', async () => {
    // AC-3
    await openTeam(teamApi({ members: [owner, aMember({ email: 'ana@example.com' })] }));

    await screen.findByText('ana@example.com');
    expect(memberRow(OWNER_EMAIL).queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Desactivar a ana@example.com' }),
    ).toBeInTheDocument();
  });
});

describe('/team invitations', () => {
  async function invite(user: ReturnType<typeof userEvent.setup>, email: string) {
    await user.click(await screen.findByRole('button', { name: team.invite.open }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(team.invite.email), email);
    await user.click(within(sheet).getByRole('button', { name: team.invite.submit }));
  }

  it('invites an employee, confirms in Spanish and lists the pending invitation', async () => {
    // AC-2
    const api = teamApi({ members: [owner] });
    const user = userEvent.setup();
    await openTeam(api);

    await invite(user, 'ana@example.com');

    expect(
      await screen.findByText(team.invite.success.replace('{{email}}', 'ana@example.com')),
    ).toBeInTheDocument();
    expect(api.invitations.map((entry) => [entry.email, entry.role])).toEqual([
      ['ana@example.com', 'employee'],
    ]);
    const pending = await screen.findByRole('heading', { name: team.invitations.title });
    const section = pending.closest('section');
    if (!section) throw new Error('invitations section missing');
    expect(within(section).getByText('ana@example.com')).toBeInTheDocument();
    expect(within(section).getByText(team.status.pending)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the pending and the expired invitations of the business', async () => {
    // AC-2
    await openTeam(
      teamApi({
        members: [owner],
        invitations: [
          anInvitation({ email: 'nueva@example.com' }),
          anInvitation({ email: 'vieja@example.com', status: 'expired' }),
        ],
      }),
    );

    const row = (email: string) => memberRow(email);
    expect(await screen.findByText('nueva@example.com')).toBeInTheDocument();
    expect(row('nueva@example.com').getByText(team.status.pending)).toBeInTheDocument();
    expect(row('vieja@example.com').getByText(team.status.expired)).toBeInTheDocument();
  });

  it('rejects an invalid address before calling the API', async () => {
    // AC-2
    const api = teamApi({ members: [owner] });
    const user = userEvent.setup();
    await openTeam(api);

    await invite(user, 'not-an-email');

    expect(await screen.findByText(team.validation.emailInvalid)).toBeInTheDocument();
    expect(api.invitations).toHaveLength(0);
  });
});

describe('/team disabling and enabling', () => {
  it('disables an employee after confirmation and enables them again', async () => {
    // AC-3
    const ana = aMember({ email: 'ana@example.com' });
    const api = teamApi({ members: [owner, ana] });
    const user = userEvent.setup();
    await openTeam(api);

    await user.click(await screen.findByRole('button', { name: 'Desactivar a ana@example.com' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.members.find((m) => m.userId === ana.userId)?.status).toBe('active');
    await user.click(within(dialog).getByRole('button', { name: team.disableDialog.confirm }));

    await waitFor(() =>
      expect(memberRow('ana@example.com').getByText(team.status.disabled)).toBeInTheDocument(),
    );
    expect(api.members.find((m) => m.userId === ana.userId)?.status).toBe('disabled');
    expect(await screen.findByText(/ya no puede entrar/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Activar a ana@example.com' }));

    await waitFor(() =>
      expect(memberRow('ana@example.com').getByText(team.status.active)).toBeInTheDocument(),
    );
    expect(api.members.find((m) => m.userId === ana.userId)?.status).toBe('active');
  });

  it('keeps the employee active when the owner cancels the confirmation', async () => {
    // AC-3
    const ana = aMember({ email: 'ana@example.com' });
    const api = teamApi({ members: [owner, ana] });
    const user = userEvent.setup();
    await openTeam(api);

    await user.click(await screen.findByRole('button', { name: 'Desactivar a ana@example.com' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: team.disableDialog.cancel,
      }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(memberRow('ana@example.com').getByText(team.status.active)).toBeInTheDocument();
    expect(api.members.find((m) => m.userId === ana.userId)?.status).toBe('active');
  });
});

describe('/team failures', () => {
  it('shows a Spanish message for a domain error and never the server text', async () => {
    // AC-5
    const user = userEvent.setup();
    const second = aMember({ email: 'otro@example.com', role: 'owner' });
    await openTeam(teamApi({ members: [owner, second] }));
    server.use(
      http.patch(apiUrl('/members/:userId'), () =>
        HttpResponse.json(
          { code: 'LAST_OWNER', message: 'The business must keep at least one active owner' },
          { status: 409 },
        ),
      ),
    );

    await user.click(await screen.findByRole('button', { name: 'Desactivar a otro@example.com' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: team.disableDialog.confirm,
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(team.errors.LAST_OWNER);
    expect(screen.queryByText(/must keep/i)).not.toBeInTheDocument();
  });

  it('shows a Spanish message when the invitation email cannot be sent', async () => {
    // AC-5
    const user = userEvent.setup();
    await openTeam(teamApi({ members: [owner] }));
    server.use(
      http.post(apiUrl('/auth/invitations'), () =>
        HttpResponse.json(
          { code: 'INVITE_DELIVERY_FAILED', message: 'The invitation email could not be sent' },
          { status: 502 },
        ),
      ),
    );

    await user.click(await screen.findByRole('button', { name: team.invite.open }));
    const sheet = await screen.findByRole('dialog');
    await user.type(within(sheet).getByLabelText(team.invite.email), 'ana@example.com');
    await user.click(within(sheet).getByRole('button', { name: team.invite.submit }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      team.errors.INVITE_DELIVERY_FAILED,
    );
    expect(screen.queryByText(/could not be sent/i)).not.toBeInTheDocument();
  });

  it('falls back to the generic Spanish message for an unknown code', async () => {
    // AC-5
    server.use(
      http.get(apiUrl('/members'), () =>
        HttpResponse.json({ code: 'SOMETHING_NEW', message: 'English only' }, { status: 500 }),
      ),
    );
    renderApp({ path: '/team', session: TEST_USER, tenantId: OWNER_TENANT.tenantId });

    expect(await screen.findByRole('alert')).toHaveTextContent(common.errors.generic);
    expect(screen.queryByText(/English only/)).not.toBeInTheDocument();
  });
});
