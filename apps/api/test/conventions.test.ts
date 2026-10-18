import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Parallel lanes append to these registries at the same time. These tests turn a wrong merge
// (a missing, duplicated or unsorted line) into a CI failure with a clear message.
const apiRoot = path.resolve(__dirname, '..');
const src = path.join(apiRoot, 'src');
const read = (file: string): string => readFileSync(file, 'utf8');
const isSorted = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || (values[index - 1] ?? '') < value);

const moduleNames = readdirSync(path.join(src, 'modules'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe('src/app.modules.ts', () => {
  const source = read(path.join(src, 'app.modules.ts'));
  const imports = [
    ...source.matchAll(/^import \{ (\w+) \} from '\.\/modules\/([a-z0-9-]+)\/\2\.module';$/gm),
  ];
  const importedModules = imports.map((match) => match[2] ?? '');
  const importedClasses = imports.map((match) => match[1] ?? '');
  const listBody = /export const APP_MODULES = \[([^\]]*)\]/.exec(source)?.[1] ?? '';
  const listed = [...listBody.matchAll(/^\s+(\w+),$/gm)].map((match) => match[1] ?? '');

  it('imports every module that has a Nest module file, once', () => {
    const withNestModule = moduleNames.filter((name) =>
      existsSync(path.join(src, 'modules', name, `${name}.module.ts`)),
    );
    expect([...importedModules].sort()).toEqual([...withNestModule].sort());
  });

  it('keeps imports sorted by module folder and lists exactly the imported classes, sorted', () => {
    expect(isSorted(importedModules), importedModules.join(', ')).toBe(true);
    expect([...listed].sort()).toEqual([...importedClasses].sort());
    expect(isSorted(listed), listed.join(', ')).toBe(true);
  });
});

describe('src/infrastructure/db/schema.ts', () => {
  const source = read(path.join(src, 'infrastructure', 'db', 'schema.ts'));
  const exported = [
    ...source.matchAll(
      /^export \* from '\.\.\/\.\.\/modules\/([a-z0-9-]+)\/infrastructure\/schema';$/gm,
    ),
  ].map((match) => match[1] ?? '');

  it('re-exports each module schema once, sorted, and only files that exist', () => {
    expect(new Set(exported).size).toBe(exported.length);
    expect(isSorted(exported), exported.join(', ')).toBe(true);
    for (const name of exported) {
      expect(existsSync(path.join(src, 'modules', name, 'infrastructure', 'schema.ts')), name).toBe(
        true,
      );
    }
  });
});

describe('drizzle migrations', () => {
  const journalPath = path.join(apiRoot, 'drizzle', 'meta', '_journal.json');

  it('has a journal whose entries are increasing, timestamp-named and backed by a SQL file', () => {
    // Skips until the first migration exists (issue #10 or #11 adds it).
    if (!existsSync(journalPath)) return;
    const journal = JSON.parse(read(journalPath)) as {
      entries: { when: number; tag: string }[];
    };
    const whens = journal.entries.map((entry) => entry.when);
    expect(whens.every((when, index) => index === 0 || when > (whens[index - 1] ?? 0))).toBe(true);
    for (const { tag } of journal.entries) {
      expect(tag, tag).toMatch(/^\d{14}_/);
      expect(existsSync(path.join(apiRoot, 'drizzle', `${tag}.sql`)), tag).toBe(true);
    }
  });
});
