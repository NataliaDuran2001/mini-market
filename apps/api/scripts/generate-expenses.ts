// Operator and cron script that generates the recurring expenses of a month (S5):
//   pnpm --filter @mini-market/api expenses:generate                  current month of each business
//   pnpm --filter @mini-market/api expenses:generate -- --period 2026-11
// Expenses are also generated lazily when the owner opens a month, so this only makes sure they
// exist on the first day. It never duplicates: running it twice, or while an owner views the
// month, creates nothing new. It connects with the migration (owner) role, never `app_user`.
import { parseArgs } from 'node:util';
import { Period, SystemClock } from '@mini-market/shared-kernel';
import type { Clock } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/infrastructure/db/database';
import { createWithTransaction } from '../src/infrastructure/db/with-transaction';
import type { WithTransaction } from '../src/infrastructure/db/with-transaction';
import { DomainEventBus } from '../src/infrastructure/events/domain-event-bus';
import { describeError } from '../src/infrastructure/logger/describe-error';
import {
  DrizzleExpenseRepository,
  DrizzleRecurringExpenseRepository,
  ensurePeriodGenerated,
} from '../src/modules/payables';
import type { EnsurePeriodGeneratedDeps } from '../src/modules/payables';
import { tenants } from '../src/modules/tenancy';

export const USAGE = `Usage: pnpm --filter @mini-market/api expenses:generate [-- --period YYYY-MM]

Without --period each business gets the current month in its own timezone.
Environment: MIGRATION_DATABASE_URL (owner role that bypasses RLS).`;

const DEFAULT_TIMEZONE = 'America/La_Paz';

export interface TenantToGenerate {
  readonly id: string;
  readonly slug: string;
  readonly timezone: string;
}

export interface GenerateExpensesDeps extends EnsurePeriodGeneratedDeps {
  readonly listTenants: () => Promise<readonly TenantToGenerate[]>;
  readonly withTransaction: WithTransaction;
  readonly clock: Clock;
  readonly log: (line: string) => void;
  readonly logError: (line: string) => void;
}

/** @returns the process exit code: 0 when every business was handled, 1 on bad input or a failure */
export async function runGenerateExpenses(
  deps: GenerateExpensesDeps,
  argv: readonly string[],
): Promise<number> {
  let requested: Period | undefined;
  try {
    const args = argv.filter((arg, index) => !(index === 0 && arg === '--'));
    const { values } = parseArgs({
      args,
      options: { period: { type: 'string' } },
      strict: true,
    });
    if (values.period !== undefined) {
      const parsed = Period.parse(values.period);
      if (!parsed.ok) throw new Error('--period must be YYYY-MM');
      requested = parsed.value;
    }
  } catch (error) {
    deps.logError(error instanceof Error ? error.message : 'Invalid arguments');
    deps.logError(USAGE);
    return 1;
  }

  let failed = 0;
  for (const tenant of await deps.listTenants()) {
    try {
      const period = requested ?? Period.fromDate(deps.clock.now(), tenant.timezone);
      const created = await deps.withTransaction({ tenantId: tenant.id, events: [] }, (tx) =>
        ensurePeriodGenerated(deps, tx, tenant.id, period),
      );
      deps.log(`${tenant.slug}: ${period.toString()} created ${created}`);
    } catch (error) {
      failed += 1;
      deps.logError(`${tenant.slug}: failed ${JSON.stringify(describeError(error))}`);
    }
  }
  return failed === 0 ? 0 : 1;
}

function timezoneOf(settings: unknown): string {
  const timezone = (settings as { timezone?: unknown } | null)?.timezone;
  return typeof timezone === 'string' ? timezone : DEFAULT_TIMEZONE;
}

async function main(argv: readonly string[]): Promise<number> {
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
    return await runGenerateExpenses(
      {
        expenses: new DrizzleExpenseRepository(),
        recurring: new DrizzleRecurringExpenseRepository(),
        listTenants: async () =>
          (
            await connection.db
              .select({ id: tenants.id, slug: tenants.slug, settings: tenants.settings })
              .from(tenants)
          ).map((row) => ({ id: row.id, slug: row.slug, timezone: timezoneOf(row.settings) })),
        withTransaction: createWithTransaction(connection.db, new DomainEventBus()),
        clock: new SystemClock(),
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
      console.error(`Generation failed: ${JSON.stringify(describeError(error))}`);
      process.exitCode = 1;
    },
  );
}
