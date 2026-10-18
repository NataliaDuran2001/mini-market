import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MODULE_GRAPH,
  allowedModuleImports,
  baseConfig,
  reachableModules,
} from '../eslint/index.mjs';

// Independent copy of docs/02-architecture.md section 4 ("A -> B": A uses the public API of B).
const DOCUMENTED_GRAPH: Record<string, readonly string[]> = {
  access: ['tenancy'],
  audit: ['tenancy'],
  catalog: ['tenancy'],
  inventory: ['catalog'],
  purchasing: ['inventory', 'payables'],
  sales: ['catalog', 'inventory', 'receivables'],
  payables: ['tenancy'],
  equity: ['tenancy'],
  receivables: ['tenancy'],
};
const MODULES = [
  'access',
  'audit',
  'catalog',
  'equity',
  'health',
  'inventory',
  'payables',
  'purchasing',
  'receivables',
  'reporting',
  'sales',
  'tenancy',
];

// Issue #11: every module may use the public API of access. tenancy is reached by access, so it
// gets the type-only variant to keep the runtime graph acyclic.
function expectedValueImport(from: string, to: string): boolean {
  if (from === 'reporting') return to !== 'health'; // reads every domain module (docs section 4)
  if (DOCUMENTED_GRAPH[from]?.includes(to)) return true;
  return to === 'access' && from !== 'tenancy';
}
function expectedTypeImport(from: string, to: string): boolean {
  return expectedValueImport(from, to) || (from === 'tenancy' && to === 'access');
}

let root: string;
let eslint: ESLint;

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'mm-graph-'));
  for (const module of MODULES) {
    const dir = path.join(root, 'apps/api/src/modules', module);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'index.ts'), 'export type Api = number;\nexport const api = 1;\n');
  }
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: baseConfig({ rootPath: root }),
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Lints one application file that imports every other module, two lines per target. */
async function violatingLines(from: string, others: string[]): Promise<Set<number>> {
  const lines = others.flatMap((to) => [
    `import { api as value_${to} } from '../../${to}/index';`,
    `import type { Api as Type_${to} } from '../../${to}/index';`,
  ]);
  const [result] = await eslint.lintText(`${lines.join('\n')}\n`, {
    filePath: path.join(root, 'apps/api/src/modules', from, 'application/probe.ts'),
  });
  const bad = (result?.messages ?? []).filter((m) => m.ruleId === 'boundaries/dependencies');
  return new Set(bad.map((m) => m.line));
}

describe('module dependency graph', () => {
  it.each(MODULES)('%s imports exactly the modules the graph allows', async (from) => {
    // AC-3 (docs/02-architecture.md section 4, ADR 0009)
    const others = MODULES.filter((m) => m !== from);
    const violations = await violatingLines(from, others);
    others.forEach((to, index) => {
      const valueLine = index * 2 + 1;
      const typeLine = index * 2 + 2;
      expect(violations.has(valueLine), `${from} -> ${to} (import)`).toBe(
        !expectedValueImport(from, to),
      );
      expect(violations.has(typeLine), `${from} -> ${to} (import type)`).toBe(
        !expectedTypeImport(from, to),
      );
    });
  });

  it('is acyclic', () => {
    // ADR 0009
    for (const module of Object.keys(MODULE_GRAPH)) {
      expect(reachableModules(module), module).not.toContain(module);
      expect(allowedModuleImports(module).value, module).not.toContain(module);
    }
  });

  it('declares every documented edge', () => {
    for (const [from, targets] of Object.entries(DOCUMENTED_GRAPH)) {
      for (const to of targets) {
        expect(MODULE_GRAPH[from as keyof typeof MODULE_GRAPH], from).toContain(to);
      }
    }
  });
});
