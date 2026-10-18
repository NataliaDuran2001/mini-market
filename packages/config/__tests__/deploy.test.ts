import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static guards on the deploy configuration (issue #7). That the deploy really works is proven by
// the `image` job of deploy-api.yml (build, migrations, abort on failure, health) and, once the
// accounts exist, by the first deploy. These tests stop the wiring from drifting.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const json = <T>(file: string): T => JSON.parse(read(file)) as T;

describe('Railway (railway.json and the Dockerfile)', () => {
  const railway = json<{
    build: { builder: string; dockerfilePath: string };
    deploy: { preDeployCommand: string[]; healthcheckPath: string };
  }>('railway.json');
  const dockerfile = read('apps/api/Dockerfile');

  it('builds the API Dockerfile and checks /api/v1/health, the route of the health module', () => {
    // AC-1
    expect(railway.build.builder).toBe('DOCKERFILE');
    expect(existsSync(path.join(root, railway.build.dockerfilePath))).toBe(true);
    expect(railway.deploy.healthcheckPath).toBe('/api/v1/health');
    expect(read('apps/api/src/infrastructure/http/configure-app.ts')).toContain(
      "GLOBAL_PREFIX = 'api/v1'",
    );
    expect(read('apps/api/src/modules/health/presentation/health.controller.ts')).toContain(
      "@Controller('health')",
    );
  });

  it('runs the migrations as the pre-deploy command, with a script that exists', () => {
    // AC-3
    expect(railway.deploy.preDeployCommand).toEqual(['node dist/migrate.js']);
    expect(existsSync(path.join(root, 'apps/api/src/migrate.ts'))).toBe(true);
  });

  it('builds in the order of the issue: fetch, offline install, build, deploy --prod', () => {
    // AC-1
    const steps = [
      'pnpm fetch',
      'pnpm install --offline --frozen-lockfile',
      'pnpm --filter "@mini-market/api..." build',
      'pnpm deploy --legacy --filter @mini-market/api --prod /app',
    ].map((step) => dockerfile.indexOf(step));
    expect(steps.every((index) => index >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('runs as a non-root user and carries no secrets or env files', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).not.toMatch(/\.env(?!\.example)/);
    expect(dockerfile).not.toMatch(/(SERVICE_ROLE_KEY|DATABASE_URL)=/);
    const dockerignore = read('.dockerignore');
    expect(dockerignore).toContain('**/.env');
    expect(dockerignore).toContain('**/.env.*');
    expect(dockerignore).toContain('.git');
  });

  it('reports the commit in the health version through the GIT_SHA build argument', () => {
    // AC-1
    expect(dockerfile).toContain('ARG GIT_SHA=');
    expect(dockerfile).toContain('npm pkg set version="0.0.0+$GIT_SHA"');
    expect(read('.github/workflows/deploy-api.yml')).toContain('"GIT_SHA=$HEAD_SHA"');
  });
});

describe('deploy-api.yml', () => {
  const workflow = read('.github/workflows/deploy-api.yml');

  it('deploys only after CI succeeded on a push to main, never for schedules or PRs', () => {
    // AC-1
    expect(workflow).toMatch(
      /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[main\]/,
    );
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
  });

  it('skips with a notice, not a failure, while Railway is not configured', () => {
    expect(workflow).toContain('configured=false');
    expect(workflow).toContain('::notice title=Deploy skipped::');
    expect(workflow).toContain('secrets.RAILWAY_TOKEN');
  });

  it('pins the Railway CLI to an exact version and keeps no credentials in the checkout', () => {
    expect(workflow).toMatch(/@railway\/cli@\d+\.\d+\.\d+/);
    expect(workflow).not.toMatch(/@latest/);
    expect(workflow).toContain('persist-credentials: false');
  });

  it('proves the image on pull requests: migrations, aborted failing migration, health', () => {
    // AC-3
    expect(workflow).toContain('A failing migration aborts and rolls back everything pending');
    expect(workflow).toContain('Migrations apply to an empty database, twice');
    expect(workflow).toContain('/api/v1/health');
  });

  it('no longer has a deploy-web workflow: Vercel deploys through its Git integration', () => {
    expect(existsSync(path.join(root, '.github/workflows/deploy-web.yml'))).toBe(false);
  });
});

describe('Vercel (apps/web/vercel.json)', () => {
  const vercel = json<{
    framework: string;
    installCommand: string;
    buildCommand: string;
    outputDirectory: string;
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  }>('apps/web/vercel.json');

  it('builds the web with its workspace dependencies from the repository root', () => {
    // AC-2
    expect(vercel.framework).toBe('vite');
    expect(vercel.installCommand).toBe('cd ../.. && pnpm install --frozen-lockfile');
    expect(vercel.buildCommand).toContain('--filter=@mini-market/web...');
    expect(vercel.outputDirectory).toBe('dist');
  });

  it('falls back to index.html for client routes', () => {
    // AC-2
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('sends a CSP and the security headers of docs/05-security.md', () => {
    const headers = Object.fromEntries(
      (vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []).map((header) => [
        header.key,
        header.value,
      ]),
    );
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).not.toContain('unsafe-eval');
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('environment documentation', () => {
  it('names every variable the deploy needs in docs/02-architecture.md, with no values', () => {
    const docs = read('docs/02-architecture.md');
    for (const name of [
      'DATABASE_URL',
      'MIGRATION_DATABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'WEB_ORIGIN',
      'GIT_SHA',
      'VITE_API_URL',
      'VITE_SUPABASE_ANON_KEY',
      'RAILWAY_TOKEN',
      'RAILWAY_SERVICE',
      'API_URL',
    ]) {
      expect(docs, name).toContain(`\`${name}\``);
    }
    expect(docs).not.toMatch(/postgres(ql)?:\/\/\w+:\w+@/);
  });
});
