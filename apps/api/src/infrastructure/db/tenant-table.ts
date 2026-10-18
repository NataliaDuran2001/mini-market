import type { BuildExtraConfigColumns } from 'drizzle-orm';
import { index, pgTable, uuid } from 'drizzle-orm/pg-core';
import type { PgColumnBuilderBase, PgTable, PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import { tenants } from '../../modules/tenancy/infrastructure/schema';

/** Every table created by `tenantTable`, so a test can find the ones that were not (AC-4). */
const TENANT_TABLES = new WeakSet<PgTable>();

export const isTenantTable = (table: PgTable): boolean => TENANT_TABLES.has(table);

/**
 * Declares a business table (docs/04-coding-standards.md section 8): adds `tenant_id uuid not null`
 * referencing `tenants` and an index that starts with it. The row level security policy of the
 * table is added in its migration with `app.enable_tenant_rls('<table>')`; the schema test fails
 * for a table that has neither the helper nor the policy.
 */
export function tenantTable<
  TName extends string,
  TColumns extends Record<string, PgColumnBuilderBase>,
>(
  name: TName,
  columns: TColumns,
  extra?: (
    self: BuildExtraConfigColumns<
      TName,
      TColumns & { tenantId: ReturnType<typeof tenantIdColumn> },
      'pg'
    >,
  ) => PgTableExtraConfigValue[],
) {
  const table = pgTable(name, { tenantId: tenantIdColumn(), ...columns }, (self) => [
    index(`${name}_tenant_id_idx`).on(self.tenantId),
    ...(extra?.(self) ?? []),
  ]);
  TENANT_TABLES.add(table);
  return table;
}

function tenantIdColumn() {
  return uuid()
    .notNull()
    .references(() => tenants.id);
}
