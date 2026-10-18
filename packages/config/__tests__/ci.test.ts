import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Static guards on the CI configuration (issue #6). What CI does when it runs is proven by the
// pull requests that exercise it (see the PR description of #6); these tests stop the pieces the
// protocol relies on from being edited away unnoticed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
const json = <T>(file: string): T => JSON.parse(read(file)) as T;

describe('.github/workflows/ci.yml', () => {
  const workflow = read('.github/workflows/ci.yml');

  it('has a job named ci, the required status check of main, without path filters', () => {
    // AC-1
    expect(workflow).toMatch(/^ {2}ci:\n {4}name: ci$/m);
    expect(workflow).not.toMatch(/^\s+paths(-ignore)?:/m);
    const protection = json<{ required_status_checks: { contexts: string[] } }>(
      '.github/branch-protection.json',
    );
    expect(protection.required_status_checks.contexts).toEqual(['ci']);
  });

  it('runs typecheck, lint, test and build through turbo, filtered to affected packages on PRs', () => {
    // AC-1, AC-2
    expect(workflow).toContain('pnpm exec turbo run typecheck lint test build $TURBO_FILTER');
    expect(workflow).toContain("format('--filter=...[origin/{0}]', github.base_ref)");
    expect(workflow).toMatch(/fetch-depth: 0/);
  });

  it('audits production dependencies at high severity, outside the turbo filter', () => {
    // AC-4
    expect(workflow).toContain('pnpm audit --prod --audit-level high');
  });

  it('cancels superseded runs except on main, audits weekly, keeps no credentials', () => {
    expect(workflow).toMatch(/concurrency:\n\s+group: ci-\$\{\{ github\.ref \}\}\n/);
    expect(workflow).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
    expect(workflow).toMatch(/schedule:\n\s+#.*\n\s+- cron: '0 9 \* \* 1'/);
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2);
  });

  it('uploads coverage and installs from the lockfile', () => {
    expect(workflow).toContain('name: coverage');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
  });

  it('has an e2e skeleton job that waits for ci and skips until the suite exists', () => {
    expect(workflow).toMatch(/^ {2}e2e:\n {4}name: e2e\n {4}needs: ci$/m);
    expect(workflow).toContain("hashFiles('e2e/playwright.config.ts') != ''");
    expect(workflow).toContain('playwright install --with-deps chromium');
  });
});

describe('.github/branch-protection.json', () => {
  const protection = json<{
    required_status_checks: { strict: boolean; contexts: string[] };
    required_pull_request_reviews: { dismiss_stale_reviews: boolean };
    allow_force_pushes: boolean;
    allow_deletions: boolean;
  }>('.github/branch-protection.json');

  it('requires a pull request and the ci check, dismisses stale approvals, forbids force pushes', () => {
    // AC-1, AC-3
    expect(protection.required_pull_request_reviews.dismiss_stale_reviews).toBe(true);
    expect(protection.required_status_checks.contexts).toContain('ci');
    expect(protection.allow_force_pushes).toBe(false);
    expect(protection.allow_deletions).toBe(false);
  });
});

describe('.github/renovate.json', () => {
  const renovate = json<{
    extends: string[];
    schedule: string[];
    minimumReleaseAge: string;
    automerge: boolean;
  }>('.github/renovate.json');

  it('updates weekly, groups minor and patch, waits 14 days and never automerges', () => {
    expect(renovate.schedule).toEqual(['before 6am on monday']);
    expect(renovate.extends).toContain('group:allNonMajor');
    expect(renovate.minimumReleaseAge).toBe('14 days');
    expect(renovate.automerge).toBe(false);
  });
});

describe('pull request template', () => {
  it('mirrors the Definition of Done of CLAUDE.md', () => {
    const template = read('.github/PULL_REQUEST_TEMPLATE.md');
    const claude = read('CLAUDE.md');
    const dod = claude.slice(claude.indexOf('## Definition of Done'));
    for (const item of [
      'every AC has a test',
      'tenant isolation test present',
      'no business logic in controllers',
      'migrations reversible',
      'Spanish i18n strings',
    ]) {
      expect(template, item).toContain(item);
      expect(dod, item).toContain(item);
    }
  });
});
