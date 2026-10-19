// Empties the application data of the Supabase dev project and removes the two test owners:
//   pnpm wipe:dev-data -- --confirm-project <project ref>
// Use it before a clean `pnpm setup:tenants`. It is for the dev project only (everything in it is
// test data): it TRUNCATEs every table of the `public` schema (the migration history in the
// `drizzle` schema, the roles and the schema itself stay) and deletes the Supabase Auth accounts of
// `dev-tenants.ts`. Other Auth users are not touched. Without `--confirm-project` it only says what
// it would do; with it, the typed ref must equal the project of MIGRATION_DATABASE_URL and
// SUPABASE_URL, so a `.env` that points at the wrong project is refused.
// TRUNCATE is the one operation the append-only triggers do not block: it also empties the ledger
// tables (audit log, stock, credit, capital). That is acceptable only because the dev project holds
// nothing but test data; never run it elsewhere.
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

/** @returns the project ref after `--confirm-project`, which the operator types on purpose */
export function confirmedProjectRef(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--confirm-project');
  return index === -1 ? undefined : argv[index + 1];
}

/** @returns why the wipe must not run, or undefined when every guard passes */
export function wipeRefusal(input: {
  readonly argv: readonly string[];
  readonly ownerUrl: string;
  readonly supabaseUrl: string;
  readonly nodeEnv: string | undefined;
}): string | undefined {
  if (input.nodeEnv === 'production') return 'Refusing to run with NODE_ENV=production.';
  if (!sameProject(input.ownerUrl, input.supabaseUrl)) {
    return 'MIGRATION_DATABASE_URL and SUPABASE_URL point to different projects.';
  }
  const ref = URL.canParse(input.ownerUrl) ? new URL(input.ownerUrl).username.split('.')[1] : '';
  if (confirmedProjectRef(input.argv) !== ref) {
    return 'The project ref after --confirm-project does not match the project of the environment.';
  }
  return undefined;
}

async function main(argv: readonly string[]): Promise<number> {
  const ownerUrl = requireEnv('MIGRATION_DATABASE_URL');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  console.log(
    'This deletes ALL rows of the public schema of the target project and the test owners:',
  );
  console.log(`  auth users: ${DEV_TENANTS.map((tenant) => tenant.ownerEmail).join(', ')}`);
  console.log(
    `  target project ref ends with: ${new URL(supabaseUrl).hostname.replace('.supabase.co', '').slice(-4)}`,
  );
  if (confirmedProjectRef(argv) === undefined) {
    console.log('Nothing was changed. To run it, type the ref of the dev project on purpose:');
    console.log('  pnpm wipe:dev-data -- --confirm-project <project ref>');
    return 0;
  }
  const refusal = wipeRefusal({
    argv,
    ownerUrl,
    supabaseUrl,
    nodeEnv: process.env['NODE_ENV'],
  });
  if (refusal) {
    console.error(refusal);
    return 1;
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
