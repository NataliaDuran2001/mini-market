# Lanes

Lanes are ordered sequences of issues executed by one agent each, in parallel, in separate git worktrees. A lane delivers one module end to end. Lanes depend on each other only through the dependencies written in the issues.

Frozen baseline and progress report: `docs/baseline.md`, `node scripts/baseline-status.mjs`.

Plan days below are the issue estimates (one person with Claude Code). The minimum wall-clock with 4 lanes is the critical path of 8.25 plan days. It adds no buffer for merge waits or human testing.

## Lane table

| Lane | Scope | Issues, in order | Ends (plan day) |
|---|---|---|---|
| P1 | M0 and M1 API base | #2, #3, #9, #11, #12, #13 | 2.5 |
| P2 | M0 and M1 web base | #4, #14, #15, #16 | 2.75 |
| P3 | shared, tenancy, CI, deploy | #5, #10, #6, #7 | 1.75 |
| C | M2 catalog and stock, purchases web, credit sales closing | #18, #19, #20, #23, #21, #22, #24, #25, #30, #31, #57, #59, #60 | 8.0 |
| S | M6 capital, then M4 sales | #46, #47, #48, #33, #34, #35, #36, #37, #38 | 7.75 |
| B | M3 purchases API and M5 expenses and payables | #27, #29, #40, #42, #28, #41, #43, #44 | 6.75 |
| R | M8 customers, M7 reports | #56, #58, #50, #51, #52, #53, #54 | 8.25 |

Phase 0 runs P1, P2 and P3. Lanes C, S, B and R start when #12, #13 and #15 are merged.

## Environment (every Bash command, shell state does not persist)

```
export PATH="$HOME/.nvm/versions/node/v22.23.3/bin:$PATH"
```

Node 22 and pnpm 10.18 via corepack. Do not run `nvm alias` or change the user's default Node.

Secrets live outside the repo in `C:\Users\natalia.duran\.mini-market\supabase-dev.env`. Copy only the variables an issue needs into the gitignored `apps/*/.env` of your worktree. Never print, log or commit values. The Supabase dev project is shared by all lanes: no destructive operations, no resets, tests use PGlite.

Each lane uses its own ports when it runs servers: P1 and C use API 3101 and web 5201, P2 and S use 3102 and 5202, P3 and B use 3103 and 5203, R uses 3104 and 5204.

## Protocol per issue

1. `git fetch origin` and read the issue with `gh issue view <n>`. Check every dependency is `CLOSED`. If one is not, wait with a polling loop (below). If it stays blocked, do the next unblocked issue of your lane, or report blocked.
2. `git switch -c feat/<n>-<slug> origin/main`.
3. Read `CLAUDE.md`, the docs it lists and the ADRs the issue cites. Write the plan in the PR description, not in a prompt. Do not wait for approval.
4. Implement with tests per acceptance criterion, marked `// AC-n`.
5. Gates: `pnpm typecheck && pnpm lint && pnpm test`, and the issue's e2e tag when it is an `[e2e]` issue.
6. Self-review with the `spec-reviewer` and `architecture-reviewer` agents. Fix every blocking finding.
7. `git fetch origin && git rebase origin/main`. Re-run the gates if the rebase changed anything.
8. Push the branch and open the PR with `Closes #<n>`, the DoD checklist and the acceptance criteria to tests table. When the PR must NOT close the issue, write only `Refs #<n>` and never use the words close, closes, fix, fixes, resolve or resolves next to an issue number anywhere in the body, not even negated: GitHub treats "does not close #7" as a closing keyword.
9. Wait for CI: `gh pr checks <pr> --watch`. If CI fails, fix it. If the failure comes from the CI skeleton itself and not from your change, fix the workflow in the same PR.
10. Merge only when CI is green and the review has no blocking findings: `gh pr merge <pr> --squash --delete-branch`. Never merge red or pending checks. Never force-push `main`.
11. Confirm the issue is `CLOSED`. If the merge did not close it, close it yourself with `gh issue close <n> --reason completed --comment "Delivered in PR #<pr>"`. Other lanes wait on this state. Then start the next issue.

Commits are authored by the repository owner only, with no AI trailers.

## Waiting for a dependency

```
timeout 540 bash -c 'until [ "$(gh issue view <n> --repo NataliaDuran2001/mini-market --json state --jq .state)" = "CLOSED" ]; do sleep 30; done'
```

Repeat at most 6 times. After that, stop and report which issue blocks you.

## Conflicts

- Additive lines in shared registries (module lists, schema exports, `exports` entries) resolve by keeping both sides, sorted alphabetically.
- Never discard another lane's change to resolve a conflict. If the resolution is not obvious, stop and report.
- Migrations use the timestamp prefix, but `drizzle/meta/_journal.json` and the snapshots are shared state that cannot be merged by hand. If another branch merged a migration first: rebase, delete your generated `.sql`, snapshot, journal entry and `rollback/` file, and run `db:generate` again (details in `apps/api/README.md`).
- `apps/api/src/app.modules.ts` and `apps/api/src/infrastructure/db/schema.ts` merge with git's `union` driver (both sides kept); `apps/api/test/conventions.test.ts` fails when a line is missing, duplicated or unsorted.

## What every API lane needs to know (from P1)

- Every API route needs a Supabase access token unless it carries `@Public()` (from `modules/access`), and is tenant scoped unless it carries `@WithoutTenant()`: the caller sends `X-Tenant-Id`, the tenant guard checks an active membership and builds the `TenantContext` that `@Ctx()` hands to the controller. `@RequirePermission("area.action")` guards a route; a use case ends up with `ctx` as its first parameter and starts with `requirePermission(ctx, ...)` or `ctx.can(...)`. Each module registers its permissions with `permissionsProvider("<domain>", PERMISSIONS)` in its Nest module, next to a `<domain>.permissions.ts`.
- Tests: `test/helpers/contexts.ts` has `asOwner(tenantId)` and `asEmployee(tenantId, { permissions, settings })` for use case tests; `test/helpers/seed.ts` has `seedTenant` and `seedMember`; `useAccessApp()` in `test/access-fixture.ts` gives an HTTP suite two seeded tenants and `ctx.addMember`. In integration tests build the app with `createTestApp` (it trusts a local key pair) and send `await bearerFor(app, claims)` as `Authorization`.
- Errors reach the client only through `ApiExceptionFilter`: a controller does `if (!result.ok) throw result.error`. Log failures with `describeError(error)`.
- The boundary preset now classifies imports that resolve into `packages/*/dist` (it used to skip them), so `domain` importing `@mini-market/contracts` is a lint error. Use cases may import types, never runtime values, from `apps/api/src/infrastructure/*`.
- Every migration needs `drizzle/rollback/<tag>.sql`; a test runs all rollbacks.
- `@mini-market/shared-kernel` changes are additive while lanes run. A breaking change needs its own issue and a note here.

## Lane report

When a lane stops, report: issues merged with PR URLs, gate results, issues blocked with the blocker, deviations from the issue spec, and decisions that belong to the owner.
