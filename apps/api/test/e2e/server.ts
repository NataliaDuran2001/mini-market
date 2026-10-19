// Backend of the end-to-end suite (docs/06-testing-strategy.md section 7, issue #16). One process:
//   - an in-memory PostgreSQL (PGlite) with every migration applied, API running as `app_user`
//     with row level security exactly like production;
//   - a fake Supabase Auth (./fake-supabase) the API verifies tokens against and the web logs in to;
//   - two tenants provisioned with the real provisioning script (#13): A (minimarket) and B
//     (farmacia), each with an owner and an employee (invited and accepted through the real API).
// Started by e2e/playwright.config.ts. It never touches the shared Supabase project: nothing here
// reads a real credential, and it lives under test/, outside production builds.
import 'reflect-metadata';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SystemClock } from '@mini-market/shared-kernel';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { runProvision } from '../../scripts/provision-tenant';
import { AppModule } from '../../src/app.module';
import { loadEnv } from '../../src/infrastructure/config/env';
import type { Database } from '../../src/infrastructure/db/database';
import * as schema from '../../src/infrastructure/db/schema';
import { createWithTransaction } from '../../src/infrastructure/db/with-transaction';
import { DomainEventBus } from '../../src/infrastructure/events/domain-event-bus';
import { APP_FACTORY_OPTIONS, configureApp } from '../../src/infrastructure/http/configure-app';
import { createOwnerProvisioning, SupabaseAdminClient } from '../../src/modules/access';
import { catalogSeeders, createTenantRepository } from '../../src/modules/tenancy';
import { startFakeSupabase } from './fake-supabase';
import type { FakeSupabase } from './fake-supabase';

const SERVICE_ROLE_KEY = 'e2e-service-role-key';
/** Every seeded and invited user signs in with this; the invite email round trip is not tested. */
export const E2E_PASSWORD = 'e2e-Passw0rd!';

const apiPort = Number(process.env['API_PORT'] ?? 3001);
const supabasePort = Number(process.env['E2E_SUPABASE_PORT'] ?? apiPort + 2000);
const webOrigin =
  process.env['WEB_ORIGIN'] ?? `http://localhost:${process.env['WEB_PORT'] ?? 5173}`;
const apiUrl = `http://localhost:${apiPort}/api/v1`;

const TENANTS = {
  a: {
    name: 'Minimarket Los Andes',
    slug: 'minimarket-los-andes',
    preset: 'minimarket',
    ownerEmail: 'owner.a@example.com',
    employeeEmail: 'employee.a@example.com',
  },
  b: {
    name: 'Farmacia Sol',
    slug: 'farmacia-sol',
    preset: 'farmacia',
    ownerEmail: 'owner.b@example.com',
    employeeEmail: 'employee.b@example.com',
  },
} as const;

type TenantKey = keyof typeof TENANTS;

async function callApi(
  fake: FakeSupabase,
  options: {
    readonly as: string;
    readonly path: string;
    readonly method?: string;
    readonly tenantId?: string;
    readonly body?: unknown;
  },
): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiUrl}${options.path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await fake.signAccessToken(options.as)}`,
      ...(options.tenantId ? { 'X-Tenant-Id': options.tenantId } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw new Error(`seed call ${options.path} failed with ${response.status}`);
  return (await response.json()) as Record<string, unknown>; // as: the API answers JSON objects
}

/** Owner invites the employee through the API; the employee accepts with the emailed token. */
async function seedEmployee(fake: FakeSupabase, key: TenantKey, tenantId: string): Promise<void> {
  const { ownerEmail, employeeEmail } = TENANTS[key];
  await callApi(fake, {
    as: ownerEmail,
    path: '/auth/invitations',
    method: 'POST',
    tenantId,
    body: { email: employeeEmail, role: 'employee' },
  });
  const invite = fake.invites.find((entry) => entry.email === employeeEmail);
  if (!invite?.token) throw new Error(`no invitation token recorded for ${employeeEmail}`);
  await callApi(fake, {
    as: employeeEmail,
    path: '/invitations/accept',
    method: 'POST',
    body: { token: invite.token },
  });
}

async function main(): Promise<void> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });

  const state: { summary?: unknown } = {};
  const fake = await startFakeSupabase({
    port: supabasePort,
    serviceRoleKey: SERVICE_ROLE_KEY,
    defaultPassword: E2E_PASSWORD,
    seedSummary: () => state.summary,
  });

  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused', // PGlite is injected below
    SUPABASE_URL: fake.url,
    SUPABASE_JWT_ISSUER: fake.issuer,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    WEB_ORIGIN: webOrigin,
    API_PORT: String(apiPort),
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'warn',
  });
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({
      env,
      version: 'e2e',
      database: db as unknown as Database, // as: PGlite and postgres.js share the Drizzle API (harness does the same)
      assumeRole: 'app_user',
    }),
    APP_FACTORY_OPTIONS,
  );
  configureApp(app, { env, version: 'e2e' });
  await app.listen(env.port);

  // Provisioning script of issue #13, as the operator would run it, against the fake Supabase.
  const asAdmin = createWithTransaction(db as unknown as Database, new DomainEventBus());
  const clock = new SystemClock();
  const directory = new SupabaseAdminClient({
    supabaseUrl: fake.url,
    serviceRoleKey: SERVICE_ROLE_KEY,
  });
  const seeded: Record<string, unknown> = {};
  for (const key of Object.keys(TENANTS) as TenantKey[]) {
    const tenant = TENANTS[key];
    const code = await runProvision(
      {
        tenants: createTenantRepository(asAdmin),
        access: createOwnerProvisioning(asAdmin, clock),
        directory,
        withTransaction: asAdmin,
        seeders: catalogSeeders,
        clock,
        redirectTo: new URL('/reset-password', webOrigin).toString(),
        operator: 'e2e',
        log: () => undefined,
        logError: console.error,
      },
      [
        '--name',
        tenant.name,
        '--slug',
        tenant.slug,
        '--preset',
        tenant.preset,
        '--owner-email',
        tenant.ownerEmail,
      ],
    );
    if (code !== 0) throw new Error(`provisioning ${tenant.slug} exited with ${code}`);
    const mine = await callApi(fake, { as: tenant.ownerEmail, path: '/me/tenants' });
    const tenantId = (mine['items'] as { tenantId: string }[])[0]?.tenantId;
    if (!tenantId) throw new Error(`no tenant for ${tenant.ownerEmail}`);
    await seedEmployee(fake, key, tenantId);
    seeded[key] = { ...tenant, tenantId };
  }
  state.summary = { password: E2E_PASSWORD, tenants: seeded, supabaseUrl: fake.url, apiUrl };
  console.log(`e2e backend ready: api ${apiUrl}, fake supabase ${fake.url}`);

  const stop = () => {
    void app
      .close()
      .then(() => fake.close())
      .then(() => client.close())
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
