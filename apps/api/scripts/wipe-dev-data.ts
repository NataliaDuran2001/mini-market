// Empties the application data of the Supabase dev project and removes the two test owners:
//   pnpm wipe:dev-data -- --yes
// Use it before a clean `pnpm setup:tenants`. It is for the dev project only (everything in it is
// test data): it TRUNCATEs every table of the `public` schema (the migration history in the
// `drizzle` schema, the roles and the schema itself stay) and deletes the Supabase Auth accounts of
// `dev-tenants.ts`. Other Auth users are not touched. Without `--yes` it only says what it would do.
// TRUNCATE is the one operation the append-only audit trigger does not block (docs/05-security.md).
import postgres from 'postgres';
import { describeError } from '../src/infrastructure/logger/describe-error';
import { DEV_TENANTS } from './dev-tenants';
import { AuthAdmin } from './local-auth-admin';

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run \`pnpm setup:env\` first`);
  return value;
};

/** The project ref in the pooler user name (`postgres.<ref>`) must be the one of SUPABASE_URL. */
export function sameProject(databaseUrl: string, supabaseUrl: string): boolean {
  if (!URL.canParse(databaseUrl) || !URL.canParse(supabaseUrl)) return false;
  const ref = new URL(databaseUrl).username.split('.')[1];
  return ref !== undefined && new URL(supabaseUrl).hostname === `${ref}.supabase.co`;
}

async function main(argv: readonly string[]): Promise<number> {
  const confirmed = argv.includes('--yes');
  const ownerUrl = requireEnv('MIGRATION_DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  if (process.env['NODE_ENV'] === 'production') {
    console.error('Refusing to run with NODE_ENV=production.');
    return 1;
  }
  if (!sameProject(ownerUrl, supabaseUrl)) {
    console.error('MIGRATION_DATABASE_URL and SUPABASE_URL point to different projects.');
    return 1;
  }
  console.log('This deletes ALL rows of the public schema of the dev project and the test owners:');
  console.log(`  auth users: ${DEV_TENANTS.map((tenant) => tenant.ownerEmail).join(', ')}`);
  if (!confirmed) {
    console.log('Nothing was changed. Run again with --yes: pnpm wipe:dev-data -- --yes');
    return 0;
  }
  const owner = postgres(ownerUrl, { max: 1, prepare: false, onnotice: () => undefined });
  try {
    const tables = await owner<{ name: string }[]>`
      select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`;
    if (tables.length > 0) {
      await owner.unsafe(
        `TRUNCATE TABLE ${tables.map((table) => `public.${table.name}`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    }
    console.log(`Emptied ${tables.length} tables.`);
  } finally {
    await owner.end();
  }
  const auth = new AuthAdmin({
    supabaseUrl,
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });
  for (const tenant of DEV_TENANTS) {
    const deleted = await auth.deleteUserByEmail(tenant.ownerEmail);
    console.log(`Auth user ${tenant.ownerEmail}: ${deleted ? 'deleted' : 'not found'}`);
  }
  console.log('Done. Run `pnpm setup:tenants` to create the test tenants again.');
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(`wipe:dev-data failed: ${JSON.stringify(describeError(error))}`);
      process.exitCode = 1;
    },
  );
}
