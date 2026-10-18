// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Cache isolation between businesses (issue #15): every query of tenant data builds its key with
// tenantKey(tenantId, ...), so switching business can drop them all by prefix. Keys that are not
// about the business (the person's own tenants list, the server health) are listed here.
const featuresDir = path.resolve(import.meta.dirname, '../features');
const ALLOWED = [/tenantKey\(/, /MY_TENANTS_KEY/, /queryKey: \['health'\]/];

function apiFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return apiFiles(full);
    const inApi = full.includes(`${path.sep}api${path.sep}`);
    return inApi && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

function offendingKeys(file: string, content = readFileSync(file, 'utf8')): string[] {
  return content
    .split('\n')
    .filter((line) => line.includes('queryKey') && !ALLOWED.some((ok) => ok.test(line)))
    .map((line) => `${path.relative(featuresDir, file)}: ${line.trim()}`);
}

describe('query key convention', () => {
  it('builds every query key of a feature with tenantKey()', () => {
    const files = apiFiles(featuresDir);
    expect(files.length).toBeGreaterThan(2);
    expect(files.flatMap((file) => offendingKeys(file))).toEqual([]);
  });

  it('flags a plain key (the scan is not vacuous)', () => {
    expect(offendingKeys('x/api/use-products.ts', "queryKey: ['products'],")).toHaveLength(1);
    expect(offendingKeys('x/api/use-products.ts', 'queryKey: tenantKey(id, "p"),')).toEqual([]);
  });
});
