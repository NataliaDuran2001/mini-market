// @vitest-environment node
import { baseConfig } from '@mini-market/config/eslint';
import { ESLint } from 'eslint';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the shared ESLint preset against a fixture tree that mirrors apps/web/src, with the same
// `@/` alias the web app uses, so the aliased imports of real feature code are what is checked.
const fixtureRoot = path.resolve(import.meta.dirname, '../../__fixtures__/boundaries');

// The TypeScript resolver reads the `@/` paths from a tsconfig; point it at the fixture's one
// instead of apps/web/tsconfig.json (the process working directory).
function fixtureConfig() {
  const config = baseConfig({ rootPath: fixtureRoot });
  const settings = config.find((entry) => entry.settings?.['import/resolver'])?.settings;
  // as: ESLint types settings as unknown; the preset sets exactly this resolver map.
  const resolvers = (settings?.['import/resolver'] ?? {}) as Record<string, object>;
  const withFixtureProject = Object.fromEntries(
    Object.entries(resolvers).map(([name, options]) => [
      name,
      { ...options, project: path.join(fixtureRoot, 'tsconfig.json') },
    ]),
  );
  return [...config, { settings: { 'import/resolver': withFixtureProject } }];
}

async function ruleIdsFor(file: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: fixtureConfig(),
  });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

describe('web feature boundaries', () => {
  it('reports a boundaries error when a feature imports another feature internals', async () => {
    // AC-4
    const ruleIds = await ruleIdsFor('apps/web/src/features/sales/reaches-into-feature.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('reports a boundaries error when a feature imports from the app layer', async () => {
    // AC-4
    const ruleIds = await ruleIdsFor('apps/web/src/features/sales/reaches-into-app.ts');
    expect(ruleIds).toContain('boundaries/dependencies');
  });

  it('allows a feature to use another feature index, @/ui and @/lib', async () => {
    // AC-4 (negative control: the rule is not simply failing every import)
    const ruleIds = await ruleIdsFor('apps/web/src/features/sales/allowed-imports.ts');
    expect(ruleIds).toEqual([]);
  });
});
