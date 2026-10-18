import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../harness';

const drizzleDir = path.resolve(__dirname, '../../drizzle');
const journalPath = path.join(drizzleDir, 'meta', '_journal.json');

describe('migration rollbacks', () => {
  it('undo every migration, newest first, and leave the public schema empty', async () => {
    // Definition of Done: "migrations reversible". Runs the documented rollback of each migration.
    if (!existsSync(journalPath)) return;
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
    const testDb = await createTestDb();
    try {
      for (const { tag } of [...journal.entries].reverse()) {
        await testDb.client.exec(
          readFileSync(path.join(drizzleDir, 'rollback', `${tag}.sql`), 'utf8'),
        );
      }
      const { rows } = await testDb.client.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public'",
      );
      expect(rows).toEqual([]);
    } finally {
      await testDb.close();
    }
  });
});
