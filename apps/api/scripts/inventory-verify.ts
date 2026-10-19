// Operator job (ADR 0005): recompute every stock level from the ledger and report drift.
//   pnpm --filter @mini-market/api inventory:verify
// Exit code 0 when levels and ledger agree, 1 when they differ or the job cannot run. Connects with
// the migration (owner) role, which must bypass row level security to see every tenant.
import { sql } from 'drizzle-orm';
import { createDatabase } from '../src/infrastructure/db/database';
import type { Database } from '../src/infrastructure/db/database';
import { findStockDrift } from '../src/modules/inventory';

export interface VerifyOutput {
  readonly log: (line: string) => void;
  readonly logError: (line: string) => void;
}

/** @returns the process exit code */
export async function verifyStockLevels(db: Database, out: VerifyOutput): Promise<number> {
  const drift = await db.transaction((tx) => findStockDrift(tx));
  if (drift.length === 0) {
    out.log('Stock levels match the ledger.');
    return 0;
  }
  out.logError(`${drift.length} product(s) where the stock level differs from the ledger:`);
  for (const row of drift) {
    out.logError(
      `  tenant ${row.tenantId} product ${row.productId}: level ${row.level}, ledger ${row.ledger}`,
    );
  }
  return 1;
}

async function main(): Promise<number> {
  // No fallback to DATABASE_URL: that is the app_user role, which RLS blocks from this job.
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
    return await verifyStockLevels(connection.db, { log: console.log, logError: console.error });
  } finally {
    await connection.close();
  }
}

if (require.main === module) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      // Message only: driver errors can carry connection details.
      console.error(
        `inventory:verify failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      process.exitCode = 1;
    },
  );
}
