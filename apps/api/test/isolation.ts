import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { expect } from 'vitest';
import { isTenantTable } from '../src/infrastructure/db/tenant-table';
import type { TransactionScope } from '../src/infrastructure/db/with-transaction';

/**
 * The reusable tenant isolation test (docs/05-security.md section 1, issue #12). Every repository
 * calls it once. It seeds rows for two tenants, then checks, through the repository and as
 * `app_user`, that:
 *  - a scope bound to a tenant reads only that tenant's rows;
 *  - a scope without a tenant reads nothing (fail closed);
 *  - a scope bound to A cannot write a row for B, even when the call names B on purpose.
 */
export async function expectTenantIsolation<Row extends { readonly tenantId: string }>(options: {
  readonly tenantA: string;
  readonly tenantB: string;
  /** Creates at least one row of the repository's table for the tenant (as the owner role). */
  readonly seed: (tenantId: string) => Promise<void>;
  /** The repository read, run through `withTransaction` with the given scope. */
  readonly list: (scope: TransactionScope | null) => Promise<readonly Row[]>;
  /** A write for `tenantId` attempted by a scope bound to another tenant; it must be rejected. */
  readonly insertFor?: (scope: TransactionScope, tenantId: string) => Promise<void>;
}): Promise<void> {
  const { tenantA, tenantB } = options;
  await options.seed(tenantA);
  await options.seed(tenantB);

  const scopeOf = (tenantId: string): TransactionScope => ({ tenantId, events: [] });
  const rowsA = await options.list(scopeOf(tenantA));
  const rowsB = await options.list(scopeOf(tenantB));
  expect(rowsA.length, 'tenant A sees its own rows').toBeGreaterThan(0);
  expect(rowsB.length, 'tenant B sees its own rows').toBeGreaterThan(0);
  expect(rowsA.every((row) => row.tenantId === tenantA)).toBe(true);
  expect(rowsB.every((row) => row.tenantId === tenantB)).toBe(true);

  expect(await options.list(null), 'no scope, no rows').toEqual([]);
  expect(await options.list({ events: [] }), 'a scope without tenant, no rows').toEqual([]);

  if (options.insertFor) {
    await expect(options.insertFor(scopeOf(tenantA), tenantB)).rejects.toThrow();
    expect(await options.list(scopeOf(tenantB))).toHaveLength(rowsB.length);
  }
}

/**
 * Asserts that a database call fails with a Postgres message matching `pattern`. Drizzle wraps the
 * driver error ("Failed query: ..."), so the message is looked for along the chain of causes.
 */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const messages: string[] = [];
  try {
    await promise;
  } catch (error) {
    for (let current: unknown = error; current instanceof Error; current = current.cause) {
      messages.push(current.message);
    }
  }
  expect(messages.length, 'the call should have failed').toBeGreaterThan(0);
  expect(messages.join(' | ')).toMatch(pattern);
}

/** Tables that have no tenant policy by design (docs/05-security.md, issue #12). */
export const TABLES_WITHOUT_TENANT_TABLE = [
  'audit_log',
  'invitations',
  'tenants',
  'users',
] as const;

/**
 * Names of the tables in `schema` that were not declared with `tenantTable()` and are not in the
 * list of exceptions: a new table that forgot the helper shows up here (AC-4).
 */
export function tablesWithoutTenantTable(
  schema: Record<string, unknown>,
  exceptions: readonly string[] = TABLES_WITHOUT_TENANT_TABLE,
): string[] {
  return Object.values(schema)
    .filter((value): value is PgTable => is(value, PgTable))
    .filter((table) => !isTenantTable(table) && !exceptions.includes(getTableName(table)))
    .map((table) => getTableName(table))
    .sort();
}
