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

  it('lets shared API infrastructure use the TenantContext type but not the runtime of access', async () => {
    // AC-3 (issue #3: withTransaction(ctx: TenantContext); keeps the module graph acyclic)
    const lint = async (code: string) => {
      const [result] = await createEslint().lintText(code, {
        filePath: path.join(boundariesRoot, 'apps/api/src/infrastructure/db/with-transaction.ts'),
      });
      return (result?.messages ?? []).map((m) => m.ruleId);
    };
    expect(
      await lint(
        "import type { TenantContext } from '../../modules/access/index';\nexport type T = TenantContext;\n",
      ),
    ).toEqual([]);
    expect(
      await lint(
        "import { accessApi } from '../../modules/access/index';\nexport const a = accessApi;\n",
      ),
    ).toContain('boundaries/dependencies');
  });

  it('lets controllers use the http infrastructure of the API but not db', async () => {
    // AC-3
    const [result] = await createEslint().lintText(
      "import { domainErrorFilter } from '../../../infrastructure/http/domain-error.filter';\nexport const f = domainErrorFilter;\n",
      {
        filePath: path.join(
          boundariesRoot,
          'apps/api/src/modules/sales/presentation/sales.controller.ts',
        ),
      },
    );
    expect(result?.messages.map((m) => m.ruleId)).toEqual([]);
    const [db] = await createEslint().lintText(
      "import { tenantTable } from '../../../infrastructure/db/tenant-table';\nexport const t = tenantTable;\n",
      {
        filePath: path.join(
          boundariesRoot,
          'apps/api/src/modules/sales/presentation/sales.controller.ts',
        ),
      },
    );
    expect(db?.messages.map((m) => m.ruleId)).toContain('boundaries/dependencies');
  });

  it('lets application import contracts but not domain', async () => {
    // AC-3 (docs/02-architecture.md section 6: domain imports only shared-kernel)
    const lint = async (layer: string) => {
      const [result] = await createEslint().lintText(
        "import { schema } from '../../../../../../packages/contracts/src/schema';\nexport const s = schema;\n",
        {
          filePath: path.join(
            boundariesRoot,
            `apps/api/src/modules/sales/${layer}/uses-contracts.ts`,
          ),
        },
      );
      return (result?.messages ?? []).map((m) => m.ruleId);
    };
    expect(await lint('application')).toEqual([]);
    expect(await lint('domain')).toContain('boundaries/dependencies');
  });

  it('lets use cases name the transaction types but not import the infrastructure runtime', async () => {
    // AC-3 (ADR 0014 and 0016: use cases receive withTransaction and the tx handle as deps)
    const lint = async (code: string) => {
      const [result] = await createEslint().lintText(code, {
        filePath: path.join(
          boundariesRoot,
          'apps/api/src/modules/sales/application/confirm-sale.ts',
        ),
      });
      return (result?.messages ?? []).map((m) => m.ruleId);
    };
    expect(
      await lint(
        "import type { Table } from '../../../infrastructure/db/tenant-table';\nexport type T = Table;\n",
      ),
    ).toEqual([]);
    expect(
      await lint(
        "import { tenantTable } from '../../../infrastructure/db/tenant-table';\nexport const t = tenantTable;\n",
      ),
    ).toContain('boundaries/dependencies');
  });

  it('keeps IO and frameworks out of domain and Nest out of application', async () => {
    // docs/02-architecture.md section 5
    const lint = async (layer: string, code: string) => {
      const [result] = await createEslint().lintText(code, {
        filePath: path.join(boundariesRoot, `apps/api/src/modules/sales/${layer}/probe.ts`),
      });
      return (result?.messages ?? []).map((m) => m.ruleId);
    };
    expect(
      await lint(
        'domain',
        "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n",
      ),
    ).toContain('no-restricted-imports');
    expect(
      await lint(
        'application',
        "import { Injectable } from '@nestjs/common';\nexport const i = Injectable;\n",
      ),
    ).toContain('no-restricted-imports');
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
