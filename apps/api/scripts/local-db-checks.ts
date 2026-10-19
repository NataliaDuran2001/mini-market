// Database checks shared by `setup:db` and `smoke:local` (issue #97, AC-3). They run against the
// real Supabase dev project. A result carries table and role names only, never a connection string.
import type { Sql } from 'postgres';

export interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  /** Short, secret free explanation. */
  readonly detail: string;
}

/** Tables with a `tenant_id` column plus `tenants`, minus the documented exception (docs/05 section 6). */
const TENANT_TABLES_WITHOUT_RLS = `
  select c.relname as name from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
          or c.relname = 'tenants')
     and c.relname <> 'invitations'
     and not (c.relrowsecurity and c.relforcerowsecurity
              and exists (select 1 from pg_policy p where p.polrelid = c.oid))
   order by c.relname`;

const TENANT_TABLE_COUNT = `
  select count(*)::int as total from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (exists (select 1 from pg_attribute a
                   where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
          or c.relname = 'tenants')
     and c.relname <> 'invitations'`;

/** AC-3: every tenant table has RLS enabled and forced, with at least one policy. */
export async function checkRlsOnTenantTables(owner: Sql): Promise<CheckResult> {
  const missing = await owner.unsafe<{ name: string }[]>(TENANT_TABLES_WITHOUT_RLS);
  const total = (await owner.unsafe<{ total: number }[]>(TENANT_TABLE_COUNT))[0]?.total ?? 0;
  if (missing.length > 0) {
    return {
      name: 'RLS enabled and forced on every tenant table',
      ok: false,
      detail: `missing on: ${missing.map((row) => row.name).join(', ')}`,
    };
  }
  return {
    name: 'RLS enabled and forced on every tenant table',
    ok: total > 0,
    detail: `${total} tables checked`,
  };
}

/** AC-3: the API role exists, can log in, and cannot bypass row level security. */
export async function checkAppUserRole(owner: Sql): Promise<CheckResult> {
  const rows = await owner<{ canlogin: boolean; bypass: boolean; super: boolean }[]>`
    select rolcanlogin as canlogin, rolbypassrls as bypass, rolsuper as super
      from pg_roles where rolname = 'app_user'`;
  const role = rows[0];
  if (!role) return { name: 'role app_user', ok: false, detail: 'role does not exist' };
  const ok = role.canlogin && !role.bypass && !role.super;
  return {
    name: 'role app_user cannot bypass RLS',
    ok,
    detail: `login ${role.canlogin}, bypassrls ${role.bypass}, superuser ${role.super}`,
  };
}

/** AC-3: the connection the API really uses (DATABASE_URL, through the pooler) is `app_user`. */
export async function checkApiConnection(app: Sql): Promise<CheckResult> {
  const [identity] = await app<{ user: string; bypass: boolean; super: boolean }[]>`
    select current_user as "user", r.rolbypassrls as bypass, r.rolsuper as super
      from pg_roles r where r.rolname = current_user`;
  return {
    name: 'API connection runs as app_user without bypass',
    ok: identity?.user === 'app_user' && !identity.bypass && !identity.super,
    detail: `connected as ${identity?.user ?? 'unknown'}`,
  };
}

/** AC-3: with no tenant bound, `app_user` sees no rows of a tenant table that holds data. */
export async function checkFailsClosed(app: Sql, owner: Sql): Promise<CheckResult> {
  const [visible] = await app<{ n: number }[]>`select count(*)::int as n from memberships`;
  const [stored] = await owner<{ n: number }[]>`select count(*)::int as n from memberships`;
  return {
    name: 'RLS fails closed: app_user without a tenant bound sees no memberships',
    ok: visible?.n === 0 && (stored?.n ?? 0) > 0,
    detail: `app_user sees ${visible?.n ?? '?'} of ${stored?.n ?? '?'} rows`,
  };
}

/**
 * AC-3: the Supabase Data API roles `anon` and `authenticated` hold no privilege on any table of
 * `public` (migration `revoke_data_api_access`), so the browser can only reach data through the API.
 */
export async function checkDataApiRolesHaveNoAccess(owner: Sql): Promise<CheckResult> {
  const name = 'anon and authenticated have no privilege on any public table';
  const rows = await owner<{ name: string }[]>`
    select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(role)
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
       and exists (select 1 from pg_roles where rolname = r.role)
       and has_table_privilege(r.role, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     order by 1`;
  return rows.length === 0
    ? { name, ok: true, detail: 'no table is reachable through the Data API' }
    : {
        name,
        ok: false,
        detail: `reachable: ${[...new Set(rows.map((row) => row.name))].join(', ')}`,
      };
}
