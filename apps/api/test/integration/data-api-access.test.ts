import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Supabase grants new `public` tables to anon and authenticated and exposes them through its Data
// API. PGlite has neither role, so this suite creates them with the same default privileges before
// it applies the migrations (issue #97: found against the real dev project).
describe('Data API access (Supabase roles anon and authenticated)', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    await client.exec(`
      create role anon nologin;
      create role authenticated nologin;
      alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;
      alter default privileges in schema public grant all on functions to anon, authenticated;
    `);
    await migrate(drizzle(client), {
      migrationsFolder: path.resolve(__dirname, '../../drizzle'),
    });
  });
  afterAll(() => client.close());

  const privilegedTables = (role: string) =>
    client.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'S')
          and (has_table_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
        order by 1`,
      [role],
    );

  it.each(['anon', 'authenticated'])(
    'leaves %s without any privilege on a public table',
    async (role) => {
      // AC-3 (the Data API must not reach users or invitations)
      const { rows } = await privilegedTables(role);
      expect(rows).toEqual([]);
    },
  );

  it.each(['anon', 'authenticated'])(
    'also denies %s on a table a later migration creates',
    async (role) => {
      // AC-3 (default privileges, so other lanes cannot reopen the door by adding a table)
      await client.exec('create table later_table (id int)');
      try {
        const { rows } = await privilegedTables(role);
        expect(rows).toEqual([]);
      } finally {
        await client.exec('drop table later_table');
      }
    },
  );

  it.each(['anon', 'authenticated'])(
    'leaves %s without EXECUTE on any function of public',
    async (role) => {
      // AC-3 (functions would be callable through /rest/v1/rpc)
      const { rows } = await client.query<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege($1, p.oid, 'EXECUTE')`,
        [role],
      );
      expect(rows).toEqual([]);
    },
  );

  it('keeps the API role working', async () => {
    const { rows } = await client.query<{ ok: boolean }>(
      `select has_table_privilege('app_user', 'users', 'SELECT') as ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });

  it('is undone by its rollback script, which gives the Supabase defaults back', async () => {
    // Definition of Done: migrations reversible, checked with the Supabase roles present
    const journal = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../drizzle/meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const tag = journal.entries
      .map((entry) => entry.tag)
      .find((t) => t.endsWith('_revoke_data_api_access'));
    expect(tag).toBeDefined();
    await client.exec(
      readFileSync(path.resolve(__dirname, `../../drizzle/rollback/${tag}.sql`), 'utf8'),
    );
    const { rows } = await client.query<{ ok: boolean }>(
      `select has_table_privilege('anon', 'users', 'SELECT') as ok`,
    );
    expect(rows[0]?.ok).toBe(true);
  });
});
