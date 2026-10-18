import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Database } from '../src/infrastructure/db/database';
import * as schema from '../src/infrastructure/db/schema';
import { createWithTransaction } from '../src/infrastructure/db/with-transaction';
import type { WithTransaction } from '../src/infrastructure/db/with-transaction';
import { DomainEventBus } from '../src/infrastructure/events/domain-event-bus';

const MIGRATIONS_FOLDER = path.resolve(__dirname, '../drizzle');

export interface TestDb {
  readonly client: PGlite;
  readonly db: Database;
  readonly bus: DomainEventBus;
  readonly withTransaction: WithTransaction;
  /** Empties every table of the `public` schema between tests; migrations stay applied. */
  truncateAll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Starts an in-memory PostgreSQL (PGlite) and applies every migration from `apps/api/drizzle`
 * (ADR 0010). Create one per test file and call `truncateAll()` in `beforeEach`.
 * @param options.migrationsFolder only the harness own tests point this elsewhere.
 */
export async function createTestDb(
  options: { readonly migrationsFolder?: string } = {},
): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  const folder = options.migrationsFolder ?? MIGRATIONS_FOLDER;
  // drizzle-kit writes meta/_journal.json with the first migration; before that there is nothing
  // to apply. SQL files without a journal mean a broken checkout: fail instead of testing nothing.
  if (existsSync(path.join(folder, 'meta', '_journal.json'))) {
    await migrate(db, { migrationsFolder: folder });
  } else if (readdirSync(folder).some((file) => file.endsWith('.sql'))) {
    throw new Error(`${folder} has SQL migrations but no meta/_journal.json`);
  }
  const bus = new DomainEventBus();
  return {
    client,
    db,
    bus,
    withTransaction: createWithTransaction(db, bus),
    truncateAll: () => truncateAll(client),
    close: () => client.close(),
  };
}

export async function truncateAll(client: PGlite): Promise<void> {
  const { rows } = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename.replaceAll('"', '""')}"`);
  await client.exec(`truncate table ${tables.join(', ')} restart identity cascade`);
}
