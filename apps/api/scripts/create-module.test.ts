import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateModuleError, createModule } from './create-module';

describe('pnpm nest:module', () => {
  let modulesDir: string;

  beforeEach(() => {
    modulesDir = mkdtempSync(path.join(os.tmpdir(), 'mm-modules-'));
  });

  afterEach(() => {
    rmSync(modulesDir, { recursive: true, force: true });
  });

  it('creates the four layers, the Nest module and the public index', () => {
    createModule({ name: 'credit-sales', modulesDir });

    const root = path.join(modulesDir, 'credit-sales');
    for (const layer of ['domain', 'application', 'infrastructure', 'presentation']) {
      expect(existsSync(path.join(root, layer)), layer).toBe(true);
    }
    expect(readFileSync(path.join(root, 'credit-sales.module.ts'), 'utf8')).toContain(
      'export class CreditSalesModule {}',
    );
    expect(readFileSync(path.join(root, 'index.ts'), 'utf8')).toBe(
      "export { CreditSalesModule } from './credit-sales.module';\n",
    );
    expect(existsSync(path.join(root, 'infrastructure', 'schema.ts'))).toBe(true);
  });

  it('refuses names that are not kebab-case and modules that already exist', () => {
    expect(() => createModule({ name: 'Sales', modulesDir })).toThrow(CreateModuleError);
    expect(() => createModule({ name: '../escape', modulesDir })).toThrow(CreateModuleError);
    createModule({ name: 'sales', modulesDir });
    expect(() => createModule({ name: 'sales', modulesDir })).toThrow(/already exists/);
  });
});
