// Operator script that onboards a business (docs/00-vision.md: manual onboarding in v1):
//   pnpm --filter @mini-market/api provision -- --name "Mini Market Doña X" --slug minimarket-x \
//     --preset minimarket --owner-email owner@example.com
// Creates the tenant with its preset, invites the owner in Supabase Auth when the address has no
// account, makes the owner a member and seeds the preset catalogs. Running it again with the same
// slug creates nothing and exits 0. It connects with the migration (owner) role, never `app_user`.
import os from 'node:os';
import { parseArgs } from 'node:util';
import { createTenantInputSchema } from '@mini-market/contracts/tenancy';
import { SystemClock } from '@mini-market/shared-kernel';
import type { Clock } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { describeError } from '../src/infrastructure/logger/describe-error';
import { createDatabase } from '../src/infrastructure/db/database';
import { createWithTransaction } from '../src/infrastructure/db/with-transaction';
import type { WithTransaction } from '../src/infrastructure/db/with-transaction';
import { DomainEventBus } from '../src/infrastructure/events/domain-event-bus';
import { createOwnerProvisioning, SupabaseAdminClient } from '../src/modules/access';
import type { OwnerProvisioning, SupabaseUserDirectory } from '../src/modules/access';
import {
  catalogSeeders,
  createTenant,
  createTenantRepository,
  seedCatalogs,
  VERTICALS,
} from '../src/modules/tenancy';
import type { CatalogSeeder, TenantRepository } from '../src/modules/tenancy';

export const USAGE = `Usage: pnpm --filter @mini-market/api provision -- \\
  --name "<business name>" --slug <slug> --preset <${VERTICALS.join('|')}> --owner-email <email>

Environment: MIGRATION_DATABASE_URL (owner role that bypasses RLS), SUPABASE_URL,
SUPABASE_SERVICE_ROLE_KEY, WEB_ORIGIN.`;

export interface ProvisionDeps {
  readonly tenants: TenantRepository;
  readonly access: OwnerProvisioning;
  readonly directory: SupabaseUserDirectory;
  readonly withTransaction: WithTransaction;
  readonly seeders: readonly CatalogSeeder[];
  readonly clock: Clock;
  /** Where the owner lands after following the invitation email. */
  readonly redirectTo: string;
  /** Recorded in the audit log. */
  readonly operator: string;
  readonly log: (line: string) => void;
  readonly logError: (line: string) => void;
}

const emailSchema = z.email();

function parseInput(argv: readonly string[]) {
  const args = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      preset: { type: 'string' },
      'owner-email': { type: 'string' },
    },
    strict: true,
  });
  const tenant = createTenantInputSchema.safeParse({
    name: values.name,
    slug: values.slug,
    vertical: values.preset,
  });
  const email = emailSchema.safeParse(values['owner-email']);
  if (!tenant.success || !email.success) {
    const problems = [
      ...(tenant.success
        ? []
        : tenant.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)),
      ...(email.success ? [] : ['owner-email: must be an email address']),
    ];
    return { problems } as const;
  }
  return { tenant: tenant.data, ownerEmail: email.data } as const;
}

/** @returns the process exit code */
export async function runProvision(deps: ProvisionDeps, argv: readonly string[]): Promise<number> {
  let input: ReturnType<typeof parseInput>;
  try {
    input = parseInput(argv);
  } catch (error) {
    deps.logError(error instanceof Error ? error.message : 'Invalid arguments');
    deps.logError(USAGE);
    return 1;
  }
  if ('problems' in input) {
    for (const problem of input.problems) deps.logError(problem);
    deps.logError(USAGE);
    return 1;
  }
  const { tenant, ownerEmail } = input;

  let tenantId: string;
  let tenantCreated = false;
  const existing = await deps.tenants.findBySlug(tenant.slug);
  if (existing) {
    tenantId = existing.id;
    // A rerun must describe the tenant it finds: another preset would audit and seed the wrong one.
    const storedPreset = (existing.settings as { vertical?: unknown } | null)?.vertical;
    if (storedPreset !== tenant.vertical) {
      deps.logError(
        `Tenant "${tenant.slug}" already exists with preset "${String(storedPreset)}", not "${tenant.vertical}".`,
      );
      return 1;
    }
  } else {
    const created = await createTenant(
      { tenants: deps.tenants, events: { publish: () => Promise.resolve() }, clock: deps.clock },
      tenant,
    );
    if (!created.ok) {
      deps.logError(`Could not create the tenant: ${created.error.message}`);
      return 1;
    }
    tenantId = created.value.id;
    tenantCreated = true;
  }

  // A tenant whose owner step failed earlier is completed here; one that has an owner is left alone.
  let ownerCreated = false;
  let invited = false;
  if (!(await deps.access.hasActiveOwner(tenantId))) {
    const user = await deps.directory.findOrInviteUser({
      email: ownerEmail,
      redirectTo: deps.redirectTo,
    });
    invited = user.invited;
    ownerCreated = await deps.access.provisionOwner({
      tenantId,
      userId: user.userId,
      email: ownerEmail,
      preset: tenant.vertical,
      operator: deps.operator,
    });
  }

  // Every run, not only the first: seeders are idempotent, and a run that stopped after the owner
  // step must not leave the tenant without catalogs.
  await seedCatalogs(
    { withTransaction: deps.withTransaction, seeders: deps.seeders },
    { tenantId, preset: tenant.vertical },
  );

  if (!tenantCreated && !ownerCreated) {
    deps.log(`Tenant "${tenant.slug}" already exists (${tenantId}). Nothing created.`);
    return 0;
  }
  deps.log(`Tenant "${tenant.slug}" ${tenantCreated ? 'created' : 'completed'} (${tenantId})`);
  deps.log(`  preset:  ${tenant.vertical}`);
  deps.log(
    `  owner:   ${ownerEmail} (${invited ? 'invitation email sent' : 'account exists, no new email'})`,
  );
  deps.log(`  catalog seeders run: ${deps.seeders.length}`);
  return 0;
}

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

async function main(argv: string[]): Promise<number> {
  // No fallback to DATABASE_URL: that is the app_user role, which RLS blocks from this script.
  const databaseUrl = process.env['MIGRATION_DATABASE_URL'];
  if (!databaseUrl) {
    console.error('MIGRATION_DATABASE_URL (the owner role) is not set.');
    return 1;
  }
  const connection = createDatabase(databaseUrl);
  try {
    const rows = await connection.db.execute(
      sql`select (rolbypassrls or rolsuper) as ok from pg_roles where rolname = current_user`,
    );
    if (!(rows as unknown as { ok: boolean }[])[0]?.ok) {
      console.error(
        'MIGRATION_DATABASE_URL must connect as a role that bypasses row level security.',
      );
      return 1;
    }
    const withTransaction = createWithTransaction(connection.db, new DomainEventBus());
    const clock = new SystemClock();
    return await runProvision(
      {
        tenants: createTenantRepository(withTransaction),
        access: createOwnerProvisioning(withTransaction, clock),
        directory: new SupabaseAdminClient({
          supabaseUrl: requireEnv('SUPABASE_URL'),
          serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        }),
        withTransaction,
        seeders: catalogSeeders,
        clock,
        redirectTo: new URL('/reset-password', requireEnv('WEB_ORIGIN')).toString(),
        operator: os.userInfo().username,
        log: console.log,
        logError: console.error,
      },
      argv,
    );
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      // describeError drops the bound query parameters (the owner email is one of them).
      console.error(`Provisioning failed: ${JSON.stringify(describeError(error))}`);
      process.exitCode = 1;
    },
  );
}
