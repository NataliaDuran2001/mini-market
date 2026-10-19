import { expect, test as base, type Page } from '@playwright/test';
import { CapitalPage } from '../pages/capital-page';
import { LoginPage } from '../pages/login-page';
import { ShellPage } from '../pages/shell-page';
import { callApi, loadSeed, type Seed, type SeededTenant } from '../support/backend';
import { formatBs, typedBs } from '../support/money';

// M6 capital (epic #45, S8): the owner records what was put into the business and what was taken
// out, the totals add up, and an employee never reaches any of it. The specs use tenant B so that
// the minimarket (A) stays clean for the sales and report flows of later milestones, and compare
// against the totals read before they start, because the same backend serves both projects
// (chromium-mobile, then chromium-desktop).
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

const MARKER = 'e2e-m6';

interface Totals {
  readonly contributed: number;
  readonly withdrawn: number;
  readonly net: number;
}

async function totalsOf(tenant: SeededTenant): Promise<Totals> {
  const result = await callApi({
    as: tenant.ownerEmail,
    path: '/capital/summary',
    tenantId: tenant.tenantId,
  });
  expect(result.status).toBe(200);
  return {
    contributed: Number(result.body['contributedCentavos']),
    withdrawn: Number(result.body['withdrawnCentavos']),
    net: Number(result.body['netCentavos']),
  };
}

async function openCapital(
  page: Page,
  tenant: SeededTenant,
  password: string,
): Promise<CapitalPage> {
  await new LoginPage(page).signIn(tenant.ownerEmail, password);
  await new ShellPage(page).openSection('Capital');
  const capital = new CapitalPage(page);
  await expect(capital.heading).toBeVisible();
  await expect(page).toHaveURL('/capital');
  return capital;
}

// AC-1: part of `pnpm e2e --grep @M6` (chromium-mobile and chromium-desktop)
test.describe('M6 capital @M6', () => {
  test('the owner records two contributions and a withdrawal and the totals add up', async ({
    page,
    seed,
  }) => {
    const tenant = seed.tenants.b;
    const before = await totalsOf(tenant);
    const capital = await openCapital(page, tenant, seed.password);
    await expect(capital.card('net')).toContainText(formatBs(before.net));

    await capital.record('Aporte', '10000', `${MARKER} capital inicial`);
    await expect(capital.card('contributed')).toContainText(
      formatBs(before.contributed + 1_000_000),
    );
    await capital.record('Aporte', '2000,00', `${MARKER} segundo aporte`);
    await capital.record('Retiro', '500', `${MARKER} retiro del dueño`);

    // S8: 10,000 + 2,000 - 500 = 11,500 on top of whatever was there
    await expect(capital.card('contributed')).toContainText(
      formatBs(before.contributed + 1_200_000),
    );
    await expect(capital.card('withdrawn')).toContainText(formatBs(before.withdrawn + 50_000));
    await expect(capital.card('net')).toContainText(formatBs(before.net + 1_150_000));
    await expect(capital.notice).toContainText('Movimiento registrado');
    await expect(capital.rows.first()).toContainText('Retiro');
    await expect(capital.rows.first()).toContainText(`-${formatBs(50_000)}`);
    await expect(capital.rows.first()).toContainText(`${MARKER} retiro del dueño`);

    const after = await totalsOf(tenant);
    expect(after.net).toBe(before.net + 1_150_000);

    // The screen still shows the same numbers after a reload (they come from the API).
    await page.reload();
    await expect(capital.card('net')).toContainText(formatBs(after.net));
  });

  test('a withdrawal above the capital is allowed, flagged, and still recorded', async ({
    page,
    seed,
  }) => {
    const tenant = seed.tenants.b;
    const before = await totalsOf(tenant);
    const capital = await openCapital(page, tenant, seed.password);
    const excess = Math.max(before.net, 0) + 1; // one centavo more than the business holds

    await capital.record('Retiro', typedBs(excess), `${MARKER} retiro excesivo`);

    await expect(capital.notice).toContainText('supera el capital neto');
    await expect(capital.card('withdrawn')).toContainText(formatBs(before.withdrawn + excess));
    await expect(capital.card('net')).toContainText(formatBs(before.net - excess));
    expect((await totalsOf(tenant)).net).toBe(before.net - excess);

    // Put the capital back, so later specs start from a non-negative business.
    const restored = await callApi({
      as: tenant.ownerEmail,
      path: '/capital/movements',
      method: 'POST',
      tenantId: tenant.tenantId,
      body: { kind: 'contribution', amountCentavos: excess, note: `${MARKER} reposición` },
    });
    expect(restored.status).toBe(200);
    expect(restored.body['warning']).toBe(false);
  });

  test('an employee has no Capital in the menu and is sent to "Sin permiso"; the API says 403', async ({
    page,
    seed,
  }) => {
    const tenant = seed.tenants.b;
    const before = await totalsOf(tenant);
    await new LoginPage(page).signIn(tenant.employeeEmail, seed.password);
    const shell = new ShellPage(page);
    expect(await shell.sections()).not.toContain('Capital');

    await page.goto('/capital');

    await expect(page.getByRole('heading', { name: 'Sin permiso' })).toBeVisible();
    await expect(page).toHaveURL('/forbidden');
    await expect(page.getByTestId('summary-net')).toHaveCount(0);

    const attempts = [
      { path: '/capital/summary', method: 'GET' },
      { path: '/capital/movements', method: 'GET' },
      {
        path: '/capital/movements',
        method: 'POST',
        body: { kind: 'contribution', amountCentavos: 100 },
      },
    ];
    for (const attempt of attempts) {
      const result = await callApi({
        as: tenant.employeeEmail,
        tenantId: tenant.tenantId,
        ...attempt,
      });
      expect(result.status, `${attempt.method} ${attempt.path}`).toBe(403);
      expect(result.body['code']).toBe('FORBIDDEN');
    }
    expect(await totalsOf(tenant)).toEqual(before);
  });

  test('the capital of one business is invisible to the owner of the other', async ({ seed }) => {
    const [a, b] = [seed.tenants.a, seed.tenants.b];
    for (const attempt of [
      { path: '/capital/summary', method: 'GET' },
      { path: '/capital/movements', method: 'GET' },
    ]) {
      const crossed = await callApi({ as: a.ownerEmail, tenantId: b.tenantId, ...attempt });
      expect(crossed.status, attempt.path).toBe(403);
      expect(crossed.body['code']).toBe('NOT_A_MEMBER');
    }

    const own = await callApi({
      as: a.ownerEmail,
      path: '/capital/movements?pageSize=100',
      tenantId: a.tenantId,
    });
    expect(own.status).toBe(200);
    const notes = (own.body['items'] as { note: string | null }[]).map((item) => item.note ?? '');
    expect(notes.filter((note) => note.includes(MARKER))).toEqual([]);
  });
});
