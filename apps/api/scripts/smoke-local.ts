// End-to-end check of the local stack against the real Supabase dev project (issue #97):
//   pnpm smoke:local          (the API must be running: `pnpm dev`)
// Prints one PASS or FAIL line per check and exits non-zero when any check fails. A line carries a
// check name and a short detail (role names, counts, HTTP statuses), never a credential, token,
// connection string or response body.
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { describeError } from '../src/infrastructure/logger/describe-error';
import { presetFor } from '../src/modules/tenancy';
import { DEV_TENANTS, tenantByKey } from './dev-tenants';
import type { DevTenant } from './dev-tenants';
import {
  checkApiConnection,
  checkAppUserRole,
  checkDataApiRolesHaveNoAccess,
  checkFailsClosed,
  checkRlsOnTenantTables,
} from './local-db-checks';
import type { CheckResult } from './local-db-checks';
import { WEB_ENV_KEYS } from './local-env';

const API_ROOT = path.resolve(__dirname, '..');
const WEB_ENV_PATH = path.resolve(API_ROOT, '../web/.env');
const REQUEST_TIMEOUT_MS = 15_000;

const pass = (name: string, detail: string): CheckResult => ({ name, ok: true, detail });
const fail = (name: string, detail: string): CheckResult => ({ name, ok: false, detail });

interface Context {
  readonly apiUrl: string;
  readonly webOrigin: string;
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly password: string;
  readonly owner: Sql;
  readonly app: Sql;
  readonly tenantIds: Partial<Record<DevTenant['key'], string>>;
  readonly tokens: Partial<Record<DevTenant['key'], string>>;
}

const timeout = () => AbortSignal.timeout(REQUEST_TIMEOUT_MS);

async function api(
  context: Context,
  route: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
  try {
    const response = await fetch(`${context.apiUrl}/api/v1${route}`, {
      headers,
      signal: timeout(),
    });
    return { status: response.status, json: await response.json().catch(() => undefined) };
  } catch {
    return { status: 0, json: undefined }; // status 0: no answer, reported by the check as a failure
  }
}

const bearer = (token: string | undefined): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {};

type Check = (context: Context) => Promise<CheckResult | readonly CheckResult[]>;

function envFilesCheck(serviceKey: string, dbPassword: string): CheckResult {
  const name = 'web env file holds public values only';
  if (!fs.existsSync(WEB_ENV_PATH))
    return fail(name, 'apps/web/.env is missing: run pnpm setup:env');
  const raw = fs.readFileSync(WEB_ENV_PATH, 'utf8');
  const keys = Object.keys(parseEnv(raw));
  const extra = keys.filter((key) => !(WEB_ENV_KEYS as readonly string[]).includes(key));
  if (extra.length > 0) return fail(name, `unexpected variables: ${extra.join(', ')}`);
  if (raw.includes(serviceKey) || raw.includes(dbPassword)) {
    return fail(name, 'a server side secret is in the web file');
  }
  return pass(name, `${keys.length} variables, no server side secret`);
}

const tenantsCheck: Check = async ({ owner, tenantIds }) => {
  const rows = await owner<
    {
      slug: string;
      id: string;
      settings: { vertical?: string; modules?: unknown };
      owners: number;
      members: number;
    }[]
  >`
    select t.slug, t.id, t.settings,
           count(m.id) filter (where m.role = 'owner' and m.status = 'active')::int as owners,
           count(m.id)::int as members
      from tenants t left join memberships m on m.tenant_id = t.id
     where t.slug in ${owner(DEV_TENANTS.map((tenant) => tenant.slug))}
     group by t.id`;
  return DEV_TENANTS.map((tenant) => {
    const name = `tenant ${tenant.key.toUpperCase()} (${tenant.preset}) has its preset and one owner`;
    const row = rows.find((entry) => entry.slug === tenant.slug);
    if (!row) return fail(name, 'tenant not found: run pnpm setup:tenants');
    tenantIds[tenant.key] = row.id;
    const expected = presetFor(tenant.preset);
    const presetOk =
      row.settings.vertical === tenant.preset &&
      JSON.stringify(row.settings.modules) === JSON.stringify(expected.modules);
    const ok = presetOk && row.owners === 1 && row.members === 1;
    return {
      name,
      ok,
      detail: `preset ${presetOk ? 'matches' : 'differs'}, ${row.owners} owner, ${row.members} members`,
    };
  });
};

const healthCheck: Check = async (context) => {
  const name = 'API is up';
  const { status } = await api(context, '/health');
  if (status === 0) return fail(name, `no answer from ${context.apiUrl}: start it with pnpm dev`);
  return status === 200
    ? pass(name, `GET /health answered 200 at ${context.apiUrl}`)
    : fail(name, `GET /health answered ${status}`);
};

async function signIn(context: Context, tenant: DevTenant): Promise<CheckResult> {
  const name = `owner ${tenant.key.toUpperCase()} signs in through Supabase Auth`;
  const response = await fetch(`${context.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: context.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tenant.ownerEmail, password: context.password }),
    signal: timeout(),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: unknown;
    error_code?: unknown;
  };
  if (!response.ok || typeof body.access_token !== 'string') {
    const code = typeof body.error_code === 'string' ? body.error_code : 'unknown';
    return fail(name, `status ${response.status} (${code}): run pnpm setup:tenants`);
  }
  context.tokens[tenant.key] = body.access_token;
  return pass(name, 'access token issued');
}

const signInCheck: Check = async (context) => [
  await signIn(context, tenantByKey('a')),
  await signIn(context, tenantByKey('b')),
];

function listedTenantIds(json: unknown): string[] {
  const items = (json as { items?: { tenantId?: unknown }[] } | undefined)?.items ?? [];
  return items.map((item) => String(item.tenantId));
}

async function meTenants(context: Context, key: DevTenant['key']): Promise<CheckResult> {
  const tenant = tenantByKey(key);
  const name = `GET /me/tenants as owner ${key.toUpperCase()} returns only tenant ${key.toUpperCase()}`;
  const token = context.tokens[key];
  if (!token) return fail(name, 'skipped: sign-in failed');
  const { status, json } = await api(context, '/me/tenants', bearer(token));
  const ids = listedTenantIds(json);
  const ok = status === 200 && ids.length === 1 && ids[0] === context.tenantIds[key];
  return {
    name,
    ok,
    detail: `status ${status}, ${ids.length} tenant${ids.length === 1 ? '' : 's'}${ok ? ` (${tenant.slug})` : ''}`,
  };
}

const meTenantsCheck: Check = async (context) => [
  await meTenants(context, 'a'),
  await meTenants(context, 'b'),
];

const tenantScopeCheck: Check = async (context) => {
  const token = context.tokens.a;
  const own = context.tenantIds.a;
  const other = context.tenantIds.b;
  const ownName = 'owner A with the tenant id of A is accepted (GET /tenant)';
  const otherName = 'owner A with the tenant id of B is refused with 403';
  const missingName = 'a request without a token is refused with 401';
  const anonymous = await api(context, '/me/tenants');
  const results: CheckResult[] = [
    anonymous.status === 401
      ? pass(missingName, 'status 401')
      : fail(missingName, `status ${anonymous.status}`),
  ];
  if (!token || !own || !other) {
    return [
      ...results,
      fail(ownName, 'skipped: sign-in or tenants missing'),
      fail(otherName, 'skipped'),
    ];
  }
  const accepted = await api(context, '/tenant', { ...bearer(token), 'X-Tenant-Id': own });
  results.push(
    accepted.status === 200
      ? pass(ownName, 'status 200')
      : fail(ownName, `status ${accepted.status}`),
  );
  const refused = await api(context, '/tenant', { ...bearer(token), 'X-Tenant-Id': other });
  const code = (refused.json as { code?: unknown } | undefined)?.code;
  results.push(
    refused.status === 403
      ? pass(otherName, `status 403${typeof code === 'string' ? ` (${code})` : ''}`)
      : fail(otherName, `status ${refused.status}`),
  );
  return results;
};

/** docs/05-security.md section 6: public signup is off. Reads the public settings, creates nothing. */
const signupCheck: Check = async (context) => {
  const name = 'public signup is disabled in Supabase Auth';
  const response = await fetch(`${context.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: context.anonKey },
    signal: timeout(),
  });
  const body = (await response.json().catch(() => ({}))) as { disable_signup?: unknown };
  return body.disable_signup === true
    ? pass(name, 'disable_signup is true')
    : fail(
        name,
        `status ${response.status}, disable_signup is not true: see docs/07-local-development.md`,
      );
};

/**
 * The Auth URL configuration of the local run: an emailed link may land on the invitation page of
 * the web app (with its `?token=`) and on nothing outside it. `/auth/v1/verify` with a bogus token
 * answers with a redirect to `redirect_to` when the URL is allowed and to the Site URL when it is
 * not, so this proves the configuration without sending an email.
 */
const redirectCheck: Check = async (context) => {
  const landing = async (target: string): Promise<string> => {
    const url = new URL('/auth/v1/verify', context.supabaseUrl);
    url.searchParams.set('token', 'smoke-check');
    url.searchParams.set('type', 'invite');
    url.searchParams.set('redirect_to', target);
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { apikey: context.anonKey },
      signal: timeout(),
    });
    await response.body?.cancel();
    return (response.headers.get('location') ?? '').split('#')[0] ?? '';
  };
  const invitation = `${context.webOrigin}/accept-invitation?token=smoke-check`;
  const accepted = await landing(invitation);
  const foreign = await landing('https://not-allowed.example.com/steal');
  return [
    accepted.startsWith(`${context.webOrigin}/accept-invitation?token=smoke-check`)
      ? pass('Auth redirect list accepts the invitation link of the web app', 'redirect honoured')
      : fail(
          'Auth redirect list accepts the invitation link of the web app',
          'redirect not honoured: see docs/07-local-development.md section 9',
        ),
    !foreign.includes('not-allowed.example.com')
      ? pass('Auth redirect list refuses a foreign origin', 'redirect replaced by the Site URL')
      : fail('Auth redirect list refuses a foreign origin', 'a foreign redirect was honoured'),
  ];
};

/** The Supabase Data API must not expose any table to the public anon key (migration of #97). */
const dataApiCheck: Check = async (context) => {
  const results: CheckResult[] = [];
  for (const table of ['users', 'invitations', 'memberships', 'tenants']) {
    const name = `the anon key cannot read ${table} through the Supabase Data API`;
    const response = await fetch(`${context.supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: context.anonKey, Authorization: `Bearer ${context.anonKey}` },
      signal: timeout(),
    });
    await response.body?.cancel();
    results.push(
      response.status === 401 || response.status === 403 || response.status === 404
        ? pass(name, `status ${response.status}`)
        : fail(name, `status ${response.status}`),
    );
  }
  return results;
};

function readContext(): { context: Context; serviceKey: string; dbPassword: string } | string {
  const web = fs.existsSync(WEB_ENV_PATH) ? parseEnv(fs.readFileSync(WEB_ENV_PATH, 'utf8')) : {};
  const env = process.env;
  const missing = [
    ['MIGRATION_DATABASE_URL', env['MIGRATION_DATABASE_URL']],
    ['DATABASE_URL', env['DATABASE_URL']],
    ['SUPABASE_URL', env['SUPABASE_URL']],
    ['SUPABASE_SERVICE_ROLE_KEY', env['SUPABASE_SERVICE_ROLE_KEY']],
    ['SMOKE_OWNER_PASSWORD', env['SMOKE_OWNER_PASSWORD']],
    ['apps/web/.env VITE_SUPABASE_ANON_KEY', web['VITE_SUPABASE_ANON_KEY']],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) return `missing: ${missing.join(', ')}. Run pnpm setup:env first.`;
  const ownerUrl = env['MIGRATION_DATABASE_URL'] as string;
  const options = { max: 1, prepare: false, onnotice: () => undefined };
  return {
    serviceKey: env['SUPABASE_SERVICE_ROLE_KEY'] as string,
    dbPassword: decodeURIComponent(new URL(ownerUrl).password),
    context: {
      apiUrl: `http://localhost:${env['API_PORT'] ?? '3001'}`,
      webOrigin: env['WEB_ORIGIN'] ?? 'http://localhost:5173',
      supabaseUrl: env['SUPABASE_URL'] as string,
      anonKey: web['VITE_SUPABASE_ANON_KEY'] as string,
      password: env['SMOKE_OWNER_PASSWORD'] as string,
      owner: postgres(ownerUrl, options),
      app: postgres(env['DATABASE_URL'] as string, options),
      tenantIds: {},
      tokens: {},
    },
  };
}

/** @returns the process exit code */
export async function runSmoke(log: (line: string) => void = console.log): Promise<number> {
  const loaded = readContext();
  if (typeof loaded === 'string') {
    log(`FAIL  configuration (${loaded})`);
    return 1;
  }
  const { context, serviceKey, dbPassword } = loaded;
  const steps: Check[] = [
    () => Promise.resolve(envFilesCheck(serviceKey, dbPassword)),
    ({ owner }) => checkRlsOnTenantTables(owner),
    ({ owner }) => checkAppUserRole(owner),
    ({ owner }) => checkDataApiRolesHaveNoAccess(owner),
    ({ app }) => checkApiConnection(app),
    tenantsCheck,
    ({ app, owner }) => checkFailsClosed(app, owner),
    healthCheck,
    signInCheck,
    meTenantsCheck,
    tenantScopeCheck,
    signupCheck,
    redirectCheck,
    dataApiCheck,
  ];
  let failures = 0;
  let total = 0;
  try {
    for (const step of steps) {
      let results: readonly CheckResult[];
      try {
        const outcome = await step(context);
        results = Array.isArray(outcome) ? outcome : [outcome as CheckResult];
      } catch (error) {
        results = [fail('check raised an error', JSON.stringify(describeError(error)))];
      }
      for (const result of results) {
        total += 1;
        if (!result.ok) failures += 1;
        log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} (${result.detail})`);
      }
    }
  } finally {
    await Promise.all([context.owner.end(), context.app.end()]);
  }
  log(
    failures === 0 ? `\nAll ${total} checks passed.` : `\n${failures} of ${total} checks failed.`,
  );
  return failures === 0 ? 0 : 1;
}

if (require.main === module) {
  runSmoke().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`smoke:local failed: ${JSON.stringify(describeError(error))}`);
      process.exitCode = 1;
    },
  );
}
