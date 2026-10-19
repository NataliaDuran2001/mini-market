// Prepares the Supabase dev database for the local run (issue #97):
//   pnpm setup:db
// 1. applies the migrations with the owner role (MIGRATION_DATABASE_URL); this also creates the
//    `app_user` role as NOLOGIN, and every run applies only what is pending;
// 2. gives `app_user` the login password that `pnpm setup:env` put in DATABASE_URL (ADR 0003: the
//    password never lives in a migration), only when the role cannot log in with it yet: the
//    Supabase pooler caches role credentials, so rewriting an unchanged password can fail the
//    next login for a few seconds;
// 3. checks that every tenant table has RLS and that the API connection cannot bypass it.
// Idempotent. Prints check names and pass or fail, never a connection string or a password.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { describeError } from '../src/infrastructure/logger/describe-error';
import {
  checkApiConnection,
  checkAppUserRole,
  checkDataApiRolesHaveNoAccess,
  checkRlsOnTenantTables,
  type CheckResult,
} from './local-db-checks';

const API_ROOT = path.resolve(__dirname, '..');

/** @returns the `app_user` password stored in a DATABASE_URL, or undefined */
export function appUserPasswordFrom(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl || !URL.canParse(databaseUrl)) return undefined;
  const url = new URL(databaseUrl);
  if (!url.username.startsWith('app_user') || url.password === '') return undefined;
  return decodeURIComponent(url.password);
}

/** Quotes a value as an SQL string literal. ALTER ROLE does not accept bound parameters. */
export const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const LOGIN_ATTEMPTS = 8;
const LOGIN_RETRY_MS = 3000;
const AUTH_FAILED = '28P01';

async function canLogIn(app: Sql): Promise<boolean> {
  try {
    await app`select 1`;
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === AUTH_FAILED) return false;
    throw error;
  }
}

/** Sets the password if the role cannot log in yet, then waits until the pooler accepts it. */
async function ensureAppUserLogin(owner: Sql, app: Sql, password: string): Promise<void> {
  if (await canLogIn(app)) return;
  await owner.unsafe(`ALTER ROLE "app_user" WITH LOGIN PASSWORD ${sqlLiteral(password)}`);
  for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt++) {
    if (await canLogIn(app)) return;
    await new Promise((resolve) => setTimeout(resolve, LOGIN_RETRY_MS));
  }
  throw new Error('app_user cannot log in with the password of DATABASE_URL');
}

async function main(): Promise<number> {
  const ownerUrl = process.env['MIGRATION_DATABASE_URL'];
  const appUrl = process.env['DATABASE_URL'];
  const password = appUserPasswordFrom(appUrl);
  if (!ownerUrl || !appUrl || !password) {
    console.error(
      'MIGRATION_DATABASE_URL and a DATABASE_URL for app_user are required: run `pnpm setup:env` first.',
    );
    return 1;
  }

  // The same job Railway would run as pre-deploy command (`src/migrate.ts`), as a child process.
  const migration = spawnSync(
    process.execPath,
    ['-r', '@swc-node/register', path.join(API_ROOT, 'src', 'migrate.ts')],
    { cwd: API_ROOT, stdio: 'inherit', env: process.env },
  );
  if (migration.status !== 0) return 1;

  const owner = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(appUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    await ensureAppUserLogin(owner, app, password);
    console.log('app_user can log in with the password of DATABASE_URL.');
    const results: CheckResult[] = [
      await checkRlsOnTenantTables(owner),
      await checkAppUserRole(owner),
      await checkDataApiRolesHaveNoAccess(owner),
      await checkApiConnection(app),
    ];
    for (const result of results) {
      console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name} (${result.detail})`);
    }
    return results.every((result) => result.ok) ? 0 : 1;
  } finally {
    await Promise.all([owner.end(), app.end()]);
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`setup:db failed: ${JSON.stringify(describeError(error))}`);
      process.exitCode = 1;
    },
  );
}
