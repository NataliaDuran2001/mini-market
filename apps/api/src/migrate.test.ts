import { describe, expect, it } from 'vitest';
import { applyMigrations, readMigrationUrl, runMigrationJob } from './migrate';

const URL_WITH_SECRET = 'postgresql://owner:s3cret-pass@db.example.com:5432/postgres';

describe('readMigrationUrl', () => {
  it('prefers MIGRATION_DATABASE_URL (owner role) and falls back to DATABASE_URL', () => {
    // AC-3
    expect(
      readMigrationUrl({
        MIGRATION_DATABASE_URL: URL_WITH_SECRET,
        DATABASE_URL: 'postgres://app/x',
      }),
    ).toBe(URL_WITH_SECRET);
    expect(readMigrationUrl({ DATABASE_URL: 'postgres://app/x' })).toBe('postgres://app/x');
  });

  it.each([
    {},
    { DATABASE_URL: '' },
    { DATABASE_URL: 'mysql://x/y' },
    { MIGRATION_DATABASE_URL: 'not a url' },
  ])('returns undefined for %j', (env) => {
    // AC-3
    expect(readMigrationUrl(env)).toBeUndefined();
  });
});

describe('runMigrationJob', () => {
  it('exits 0 and applies against the migration url when everything works', async () => {
    // AC-3
    const used: string[] = [];
    const lines: string[] = [];
    const code = await runMigrationJob(
      { MIGRATION_DATABASE_URL: URL_WITH_SECRET },
      (url) => {
        used.push(url);
        return Promise.resolve();
      },
      (line) => lines.push(line),
    );
    expect(code).toBe(0);
    expect(used).toEqual([URL_WITH_SECRET]);
    expect(lines).toEqual(['Migrations applied.']);
  });

  it('exits 1 when a migration fails, so the deploy is aborted, and never prints the connection string', async () => {
    // AC-3
    const lines: string[] = [];
    const code = await runMigrationJob(
      { MIGRATION_DATABASE_URL: URL_WITH_SECRET },
      () => Promise.reject(new Error('syntax error at or near "broken"')),
      (line) => lines.push(line),
    );
    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('syntax error');
    expect(lines.join('\n')).not.toContain('s3cret-pass');
  });

  it('exits 1 without connecting when no usable url is configured', async () => {
    // AC-3
    let called = false;
    const lines: string[] = [];
    const code = await runMigrationJob(
      { DATABASE_URL: 'garbage-with-secret' },
      () => {
        called = true;
        return Promise.resolve();
      },
      (line) => lines.push(line),
    );
    expect(code).toBe(1);
    expect(called).toBe(false);
    expect(lines.join('\n')).not.toContain('garbage-with-secret');
  });

  it('exits 1 for a real database that cannot be reached', async () => {
    // AC-3 (the real migrator, nothing listens on port 1)
    const lines: string[] = [];
    const code = await runMigrationJob(
      { MIGRATION_DATABASE_URL: 'postgresql://owner:pw-123@127.0.0.1:1/postgres' },
      applyMigrations,
      (line) => lines.push(line),
    );
    expect(code).toBe(1);
    expect(lines.join('\n')).not.toContain('pw-123');
  });
});
