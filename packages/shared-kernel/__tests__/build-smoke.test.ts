import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('build output', () => {
  it('ships ESM plus type declarations that the package exports point to', () => {
    // AC-5 (turbo runs build before this test, see turbo.json)
    const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
      type: string;
      exports: Record<string, { types: string; default: string }>;
    };
    expect(pkg.type).toBe('module');
    const entry = pkg.exports['.'];
    expect(entry).toBeDefined();
    for (const file of [entry?.types, entry?.default]) {
      expect(file && existsSync(path.join(packageDir, file))).toBe(true);
    }
  });

  it('is importable through its package name exactly as an app imports it', async () => {
    // AC-5
    const kernel = await import('@mini-market/shared-kernel');
    expect(Object.keys(kernel)).toEqual(
      expect.arrayContaining([
        'Money',
        'Quantity',
        'Period',
        'WeightedAverage',
        'ok',
        'err',
        'DomainError',
        'SystemClock',
        'FixedClock',
      ]),
    );
    expect(kernel.Money.fromCentavos(1).toDecimalString()).toBe('0.01');
  });

  it('has no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
      dependencies?: unknown;
    };
    expect(pkg.dependencies).toBeUndefined();
  });
});
