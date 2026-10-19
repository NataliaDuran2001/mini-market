import { defineConfig, devices } from '@playwright/test';

// Ports come from the environment so parallel lanes can run side by side (docs/lanes.md).
const apiPort = Number(process.env['API_PORT'] ?? 3001);
const webPort = Number(process.env['WEB_PORT'] ?? 5173);
const supabasePort = Number(process.env['E2E_SUPABASE_PORT'] ?? apiPort + 2000);
const webUrl = `http://localhost:${webPort}`;

// Locally the system Edge can stand in for the downloaded Chromium: E2E_BROWSER_CHANNEL=msedge.
const channel = process.env['E2E_BROWSER_CHANNEL'];
const browser = channel ? { channel } : {};

export default defineConfig({
  testDir: './tests',
  // One backend with shared data: specs are written to be independent, but run them one by one.
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
  },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], ...browser } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], ...browser } },
  ],
  webServer: [
    {
      // API on PGlite with a fake Supabase and two provisioned tenants (apps/api/test/e2e).
      command: 'pnpm --filter @mini-market/api exec node -r @swc-node/register test/e2e/server.ts',
      url: `http://localhost:${supabasePort}/__e2e/ready`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        API_PORT: String(apiPort),
        WEB_PORT: String(webPort),
        E2E_SUPABASE_PORT: String(supabasePort),
      },
    },
    {
      command: 'pnpm --filter @mini-market/web dev',
      url: webUrl,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: {
        WEB_PORT: String(webPort),
        VITE_API_URL: `http://localhost:${apiPort}`,
        VITE_SUPABASE_URL: `http://localhost:${supabasePort}`,
        VITE_SUPABASE_ANON_KEY: 'e2e-anon-key',
        VITE_QUERY_DEVTOOLS: 'off',
      },
    },
  ],
});
