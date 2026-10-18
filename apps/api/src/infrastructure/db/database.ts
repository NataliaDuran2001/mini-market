import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/** Drizzle handle shared by the production driver (postgres.js) and PGlite in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The handle a repository receives inside `withTransaction`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseConnection {
  readonly db: Database;
  close(): Promise<void>;
}

/**
 * Opens the pooled connection. `postgres` connects lazily, so the API boots without the database.
 * `prepare: false` is required by the Supabase pooler in transaction mode (docs/02 section 8).
 */
export function createDatabase(url: string): DatabaseConnection {
  const client = postgres(url, { prepare: false, max: 10 });
  return {
    db: drizzle(client, { schema, casing: 'snake_case' }),
    close: () => client.end(),
  };
}
