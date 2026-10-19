import { expect, test as base } from '@playwright/test';
import { AcceptInvitationPage } from '../pages/accept-invitation-page';
import { LoginPage } from '../pages/login-page';
import { ShellPage } from '../pages/shell-page';
import {
  apiBaseUrl,
  callApi,
  createEmployee,
  inviteEmployee,
  invitationLink,
  loadSeed,
  uniqueEmail,
  type Seed,
} from '../support/backend';

// M1 foundation (epic #8): two tenants, each with an owner and an employee, signed in from a phone
// and from a PC; each person sees only their business and only what their role allows.
const test = base.extend<object, { seed: Seed }>({
  seed: [
    // Playwright requires the destructured first argument, even when no fixture is used.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await loadSeed());
    },
    { scope: 'worker' },
  ],
});

const OWNER_SECTIONS = [
  'Vender',
  'Productos',
  'Compras',
  'Gastos',
  'Reportes',
  'Capital',
  'Configuración',
];
const OWNER_ONLY = ['Gastos', 'Reportes', 'Capital', 'Configuración'];
const EMPLOYEE_SECTIONS = ['Vender', 'Productos', 'Compras'];

// AC-1: part of `pnpm e2e --grep @M1` (chromium-mobile and chromium-desktop)
test.describe('M1 login and roles @M1', () => {
  test('owner of A signs in and sees A, the whole menu and nothing of B', async ({
    page,
    seed,
  }) => {
    await new LoginPage(page).signIn(seed.tenants.a.ownerEmail, seed.password);
    const shell = new ShellPage(page);

    await expect(shell.tenantName).toHaveText(seed.tenants.a.name);
    await expect(page).toHaveURL('/');
    const sections = await shell.sections();
    for (const section of OWNER_SECTIONS) expect(sections).toContain(section);
    // Module entries follow the tenant settings, which load a moment after the role.
    await expect.poll(() => shell.sections()).toContain('Fiado / Clientes');
    await expect(page.getByText(seed.tenants.b.name)).toHaveCount(0);
  });

  test('employee of A has no Reportes, Capital, Configuración or Gastos', async ({
    page,
    seed,
  }) => {
    await new LoginPage(page).signIn(seed.tenants.a.employeeEmail, seed.password);
    const shell = new ShellPage(page);

    await expect(shell.tenantName).toHaveText(seed.tenants.a.name);
    const sections = await shell.sections();
    for (const section of EMPLOYEE_SECTIONS) expect(sections).toContain(section);
    for (const section of OWNER_ONLY) expect(sections).not.toContain(section);
  });

  test('owner of B signs in and sees the pharmacy business with its modules', async ({
    page,
    seed,
  }) => {
    await new LoginPage(page).signIn(seed.tenants.b.ownerEmail, seed.password);
    const shell = new ShellPage(page);

    await expect(shell.tenantName).toHaveText(seed.tenants.b.name);
    await expect.poll(() => shell.sections()).toContain('Fiado / Clientes');
    await expect(page.getByText(seed.tenants.a.name)).toHaveCount(0);

    // The pharmacy preset switches lots and fractional sales on; the minimarket preset does not.
    // There is no settings screen yet (M2 and later), so the modules are read from the API.
    const pharmacy = await callApi({
      as: seed.tenants.b.ownerEmail,
      path: '/tenant',
      tenantId: seed.tenants.b.tenantId,
    });
    expect(pharmacy.body['settings']).toMatchObject({
      vertical: 'farmacia',
      modules: { lots: true, fractional: true, credit_sales: true },
    });
    const minimarket = await callApi({
      as: seed.tenants.a.ownerEmail,
      path: '/tenant',
      tenantId: seed.tenants.a.tenantId,
    });
    expect(minimarket.body['settings']).toMatchObject({
      vertical: 'minimarket',
      modules: { lots: false, fractional: false, credit_sales: true },
    });
  });

  test('wrong credentials show a Spanish error and keep the person on /login', async ({
    page,
    seed,
  }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.submit(seed.tenants.a.ownerEmail, 'not-the-password');

    await expect(login.error).toHaveText('Correo o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a protected route sends an anonymous visitor to /login and back after signing in', async ({
    page,
    seed,
  }) => {
    await page.goto('/forbidden');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fforbidden/);

    await new LoginPage(page).submit(seed.tenants.a.employeeEmail, seed.password);
    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
    await expect(page).toHaveURL('/forbidden');
  });

  test('logout ends the session', async ({ page, seed }) => {
    await new LoginPage(page).signIn(seed.tenants.a.ownerEmail, seed.password);
    await new ShellPage(page).logout();

    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

// AC-1: part of `pnpm e2e --grep @M1` (chromium-mobile and chromium-desktop)
test.describe('M1 tenant isolation @M1', () => {
  test('a token of A with the tenant id of B is refused with 403', async ({ seed }) => {
    for (const email of [seed.tenants.a.ownerEmail, seed.tenants.a.employeeEmail]) {
      const asOther = await callApi({
        as: email,
        path: '/tenant',
        tenantId: seed.tenants.b.tenantId,
      });
      expect(asOther.status, email).toBe(403);
      expect(asOther.body['code']).toBe('NOT_A_MEMBER');
    }
  });

  test('each person lists only their own business', async ({ seed }) => {
    const owner = await callApi({ as: seed.tenants.a.ownerEmail, path: '/me/tenants' });
    expect(owner.body['items']).toEqual([
      expect.objectContaining({ tenantId: seed.tenants.a.tenantId, role: 'owner' }),
    ]);
    const employee = await callApi({ as: seed.tenants.b.employeeEmail, path: '/me/tenants' });
    expect(employee.body['items']).toEqual([
      expect.objectContaining({ tenantId: seed.tenants.b.tenantId, role: 'employee' }),
    ]);
  });

  test('an employee cannot reach owner-only endpoints of their own business', async ({ seed }) => {
    const members = await callApi({
      as: seed.tenants.a.employeeEmail,
      path: '/members',
      tenantId: seed.tenants.a.tenantId,
    });
    expect(members.status).toBe(403);
    expect(members.body['code']).toBe('FORBIDDEN');
  });
});

// AC-1: part of `pnpm e2e --grep @M1` (chromium-mobile and chromium-desktop)
test.describe('M1 transport headers @M1', () => {
  test('the API sends security headers and allows only the web origin', async () => {
    const webOrigin = `http://localhost:${process.env['WEB_PORT'] ?? 5173}`;
    const health = `${apiBaseUrl()}/health`;

    const allowed = await fetch(health, { headers: { Origin: webOrigin } });
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('strict-transport-security')).toBeTruthy();
    expect(allowed.headers.get('x-powered-by')).toBeNull();
    expect(allowed.headers.get('access-control-allow-origin')).toBe(webOrigin);

    const foreign = await fetch(health, { headers: { Origin: 'http://evil.example' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });
});

// AC-1: part of `pnpm e2e --grep @M1` (chromium-mobile and chromium-desktop)
test.describe('M1 invitations and disabling @M1', () => {
  test('an invited employee sets a password in the app and lands in the business without owner menus', async ({
    page,
    seed,
  }) => {
    const tenant = seed.tenants.a;
    const email = uniqueEmail('invited');
    const token = await inviteEmployee(tenant, email);

    const accept = new AcceptInvitationPage(page);
    await accept.open(await invitationLink(email, token));
    await accept.choosePassword('a-brand-new-password');

    const shell = new ShellPage(page);
    await expect(shell.tenantName).toHaveText(tenant.name);
    const sections = await shell.sections();
    for (const section of OWNER_ONLY) expect(sections).not.toContain(section);

    // The new password works for the next sign in.
    await shell.logout();
    await new LoginPage(page).signIn(email, 'a-brand-new-password');
    await expect(shell.tenantName).toHaveText(tenant.name);
  });

  test('a disabled employee loses access to the business routes', async ({ page, seed }) => {
    const tenant = seed.tenants.a;
    const email = uniqueEmail('disabled');
    await createEmployee(tenant, email);
    await new LoginPage(page).signIn(email, seed.password);
    await expect(new ShellPage(page).tenantName).toHaveText(tenant.name);

    const members = await callApi({
      as: tenant.ownerEmail,
      path: '/members',
      tenantId: tenant.tenantId,
    });
    const member = (members.body['items'] as { userId: string; email: string }[]).find(
      (item) => item.email === email,
    );
    expect(member).toBeDefined();
    const disabled = await callApi({
      as: tenant.ownerEmail,
      path: `/members/${member?.userId ?? ''}`,
      method: 'PATCH',
      tenantId: tenant.tenantId,
      body: { status: 'disabled' },
    });
    expect(disabled.status).toBe(200);

    const afterwards = await callApi({ as: email, path: '/tenant', tenantId: tenant.tenantId });
    expect(afterwards.status).toBe(403);

    await page.reload();
    await expect(
      page.getByText(
        'Tu cuenta todavía no pertenece a ningún negocio. Pide al dueño que te invite.',
      ),
    ).toBeVisible();
  });
});
