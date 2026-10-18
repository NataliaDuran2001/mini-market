import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { baseConfig } from '../eslint/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, '__fixtures__');
const boundariesRoot = path.join(fixtures, 'boundaries');

function createEslint(): ESLint {
  return new ESLint({
    cwd: boundariesRoot,
    overrideConfigFile: true,
    overrideConfig: baseConfig({ rootPath: boundariesRoot }),
  });
}

async function ruleIdsFor(file: string): Promise<string[]> {
  const [result] = await createEslint().lintFiles([file]);
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

describe('module boundaries', () => {
  it('reports boundaries/dependencies when sales imports inventory infrastructure', async () => {
    // AC-3
    const ruleIds = await ruleIdsFor(
      'apps/api/src/modules/sales/application/violating-use-case.ts',
    );
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('allows a module to import the public index of a module it depends on', async () => {
    // AC-3 (negative control: the rule is not simply failing every import)
    const ruleIds = await ruleIdsFor('apps/api/src/modules/sales/application/allowed-use-case.ts');
    expect(ruleIds).toEqual([]);
  });

  it('rejects a public import that is not an edge of the module graph', async () => {
    // AC-3 (docs/02-architecture.md section 4: catalog does not use inventory)
    const ruleIds = await ruleIdsFor('apps/api/src/modules/catalog/application/not-in-graph.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('rejects domain importing application', async () => {
    // AC-3
    const ruleIds = await ruleIdsFor('apps/api/src/modules/sales/domain/uses-application.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('rejects a web feature importing another feature without going through index.ts', async () => {
    // AC-3
    const ruleIds = await ruleIdsFor('apps/web/src/features/sales/reaches-into-feature.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('allows a web feature importing another feature through its index.ts', async () => {
    // AC-3 (negative control)
    const ruleIds = await ruleIdsFor('apps/web/src/features/sales/uses-public-api.ts');
    expect(ruleIds).toEqual([]);
  });

  it('lets a module wire its own layers and the app re-export module schemas', async () => {
    // AC-3 (negative controls for the parallel-lane conventions of #3: <domain>.module.ts,
    // infrastructure/schema.ts re-exported by src/infrastructure/db/schema.ts, app.modules.ts)
    const files = [
      'apps/api/src/modules/sales/domain/sibling-a.ts',
      'apps/api/src/modules/sales/index.ts',
      'apps/api/src/modules/sales/sales.module.ts',
      'apps/api/src/modules/sales/infrastructure/schema.ts',
      'apps/api/src/infrastructure/db/schema.ts',
      'apps/api/src/app.modules.ts',
    ];
    for (const file of files) {
      expect(await ruleIdsFor(file), file).toEqual([]);
    }
  });

  it('rejects a package importing from an app', async () => {
    // AC-3 (docs/02-architecture.md section 6: shared-kernel imports nothing from apps)
    const ruleIds = await ruleIdsFor('packages/shared-kernel/src/reaches-into-api.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('forbids framework and ORM imports in domain', async () => {
    // docs/02-architecture.md section 5: domain has no IO, no Nest, no Drizzle
    const [result] = await createEslint().lintText(
      "import { Injectable } from '@nestjs/common';\nexport const injectable = Injectable;\n",
      { filePath: path.join(boundariesRoot, 'apps/api/src/modules/sales/domain/uses-nest.ts') },
    );
    expect(result?.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });
});

describe('shared lint and TypeScript strictness', () => {
  it('reports no-explicit-any as an error', async () => {
    // AC-4
    const [result] = await createEslint().lintText('export const value: any = 1;\n', {
      filePath: path.join(boundariesRoot, 'apps/api/src/modules/sales/domain/uses-any.ts'),
    });
    const message = result?.messages.find((m) => m.ruleId === '@typescript-eslint/no-explicit-any');
    expect(message?.severity).toBe(2);
  });

  it('turns strict and noUncheckedIndexedAccess on for a workspace that extends the base', () => {
    // AC-4
    const configPath = path.join(fixtures, 'tsconfig', 'tsconfig.json');
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    expect(parsed.options.strict).toBe(true);
    expect(parsed.options.noUncheckedIndexedAccess).toBe(true);
    expect(parsed.options.exactOptionalPropertyTypes).toBe(true);
  });
});
