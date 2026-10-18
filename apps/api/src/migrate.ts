// Applies the SQL migrations of `drizzle/` to the database and exits. Railway runs it as the
// pre-deploy command (`node dist/migrate.js`, see railway.json): when it exits with a non-zero
// code the deploy is aborted and the previous version keeps serving (issue #7, AC-3).
//
// It uses the drizzle-orm migrator, not drizzle-kit, so the production image needs no dev tools.
// All pending migrations run in one transaction: a failing one leaves the schema as it was.
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { describeError } from './infrastructure/logger/describe-error';

const POSTGRES_URL = /^postgres(ql)?:\/\/.+/;
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../drizzle');

export type ApplyMigrations = (url: string) => Promise<void>;

/**
 * Migrations need the owner role (DDL); the API itself connects as `app_user`. So
 * `MIGRATION_DATABASE_URL` wins and `DATABASE_URL` is the fallback for setups with one role.
 * @returns undefined when neither is a postgres connection string; the value is never echoed
 */
export function readMigrationUrl(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  const candidate = env['MIGRATION_DATABASE_URL'] || env['DATABASE_URL'];
  return candidate && POSTGRES_URL.test(candidate) ? candidate : undefined;
}

export const applyMigrations: ApplyMigrations = async (url) => {
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
};

/** @returns the process exit code: 0 when every migration is applied, 1 otherwise */
export async function runMigrationJob(
  env: Readonly<Record<string, string | undefined>> = process.env,
  apply: ApplyMigrations = applyMigrations,
  log: (line: string) => void = console.error,
): Promise<number> {
  const url = readMigrationUrl(env);
  if (!url) {
    log('MIGRATION_DATABASE_URL or DATABASE_URL must be a postgres:// connection string.');
    return 1;
  }
  try {
    await apply(url);
  } catch (error) {
    // describeError drops bound parameters; the connection string is not part of driver errors.
    log(`Migration failed: ${JSON.stringify(describeError(error))}`);
    return 1;
  }
  log('Migrations applied.');
  return 0;
}

if (require.main === module) {
  runMigrationJob()
    .then((code) => process.exit(code))
    .catch(() => process.exit(1));
}
