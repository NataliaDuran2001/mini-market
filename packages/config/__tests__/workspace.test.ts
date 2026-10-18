import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

const WORKSPACES = {
  'apps/api': '@mini-market/api',
  'apps/web': '@mini-market/web',
  'packages/config': '@mini-market/config',
  'packages/contracts': '@mini-market/contracts',
  'packages/shared-kernel': '@mini-market/shared-kernel',
  e2e: '@mini-market/e2e',
} as const;

describe('monorepo skeleton', () => {
  it('declares every workspace with the @mini-market scope and is covered by pnpm-workspace.yaml', () => {
    // AC-1, AC-2
    const workspaceFile = read('pnpm-workspace.yaml').replaceAll("'", '"');
    for (const glob of ['apps/*', 'packages/*', 'e2e']) {
      expect(workspaceFile).toContain(`- "${glob}"`);
    }
    for (const [dir, name] of Object.entries(WORKSPACES)) {
      const pkg = JSON.parse(read(`${dir}/package.json`)) as { name: string };
      expect(pkg.name).toBe(name);
    }
  });

  it('keeps the lockfile in step with the workspaces so a frozen install succeeds', () => {
    // AC-1
    expect(existsSync(path.join(root, 'pnpm-lock.yaml'))).toBe(true);
    const lockfile = read('pnpm-lock.yaml');
    for (const dir of Object.keys(WORKSPACES)) {
      expect(lockfile).toMatch(new RegExp(`^ {2}${dir}:$`, 'm'));
    }
  });

  it('defines every pipeline in turbo.json and the root scripts that call them', () => {
    // AC-2
    const turbo = JSON.parse(read('turbo.json')) as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };
    for (const task of ['dev', 'build', 'test', 'lint', 'typecheck', 'e2e']) {
      expect(turbo.tasks).toHaveProperty(task);
    }
    expect(turbo.tasks['build']?.dependsOn).toContain('^build');
    expect(turbo.tasks['typecheck']?.dependsOn).toContain('^build');
    const rootPackage = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    for (const script of [
      'dev',
      'build',
      'test',
      'test:watch',
      'lint',
      'lint:fix',
      'typecheck',
      'e2e',
      'format',
    ]) {
      expect(rootPackage.scripts).toHaveProperty(script);
    }
  });

  it('pins Node 22 and pnpm 10.18 and lets lanes choose ports through the environment', () => {
    // docs/lanes.md: API_PORT and WEB_PORT must reach the tasks Turborepo starts
    const turbo = JSON.parse(read('turbo.json')) as { globalPassThroughEnv?: string[] };
    expect(turbo.globalPassThroughEnv).toEqual(expect.arrayContaining(['API_PORT', 'WEB_PORT']));
    expect(read('.nvmrc').trim()).toBe('22');
    const rootPackage = JSON.parse(read('package.json')) as { packageManager: string };
    expect(rootPackage.packageManager).toBe('pnpm@10.18.0');
  });
});
