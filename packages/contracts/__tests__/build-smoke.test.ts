import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type ExportEntry = { types: string; default: string };
const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
  type: string;
  exports: Record<string, ExportEntry>;
};

describe('build output and package exports', () => {
  it('has no root barrel: every export is a module subpath (parallel-lane convention)', () => {
    const subpaths = Object.keys(pkg.exports);
    expect(subpaths).not.toContain('.');
    expect(subpaths).not.toContain('./index');
    for (const subpath of subpaths) {
      expect(subpath).toMatch(/^\.\/[a-z][a-z0-9-]*$/);
    }
  });

  it('ships ESM plus type declarations for every exported subpath', () => {
    // AC-5 (turbo runs build before this test, see turbo.json)
    expect(pkg.type).toBe('module');
    for (const entry of Object.values(pkg.exports)) {
      for (const file of [entry.types, entry.default]) {
        expect(existsSync(path.join(packageDir, file)), file).toBe(true);
      }
    }
  });

  it('is importable through its package name, with its workspace dependency, as an app imports it', async () => {
    // AC-5
    const common = await import('@mini-market/contracts/common');
    expect(common.quantitySchema.safeParse('0.333').success).toBe(true);
    const kernel = await import('@mini-market/shared-kernel');
    expect(kernel.Quantity.parse('0.333').toString()).toBe('0.333');
  });
});
