---
name: issue
description: Execute a GitHub issue of this repo end to end (read spec, check dependencies, plan, implement with tests, verify, open PR). Usage - /issue 42
---

# /issue <number>

Execute one GitHub issue as the executable spec it is. Argument: the issue number.

## Steps

1. **Load the spec**
   ```
   gh issue view $ARGUMENTS --json number,title,body,labels,milestone,state,url
   ```
   The body has 8 sections: Milestone deliverable, Context, Scope, Acceptance criteria, Technical notes, Tests required, Dependencies, Definition of Done. If any section is missing, stop and report; do not invent it.

2. **Check dependencies.** For every `#N` under *Dependencies*, run `gh issue view N --json state`. If any is not `CLOSED`, stop and report which ones block this issue.

3. **Load context.** Read `CLAUDE.md`, `docs/01-domain.md`, `docs/02-architecture.md`, `docs/04-coding-standards.md`, `docs/05-security.md`, `docs/06-testing-strategy.md`, and every ADR the issue cites. Read the existing code of the modules the issue touches.

4. **Plan.** Enter plan mode. The plan lists, per module and layer: migrations, contracts, domain types and rules, use cases, repositories, controllers or web routes and components, i18n keys (Spanish), events, and one test per acceptance criterion (`AC-n -> test file :: test name`). Wait for approval.

5. **Branch.** `git switch -c feat/$ARGUMENTS-<slug>` from an up-to-date `main`.

6. **Implement** following the hard rules in `CLAUDE.md`. Mark each test with `// AC-n`. Add Spanish strings to i18n; never hardcode UI text.

7. **Run gates**: `pnpm typecheck && pnpm lint && pnpm test`. For `[e2e]` issues also `pnpm e2e --grep @M<n>`. Fix until green. Report real output; never claim green without running.

8. **Verify**: run `/verify-issue $ARGUMENTS`. Fix every blocking gap and rerun.

9. **Commit and PR.** Conventional Commits with the issue number. Push the branch (`git push origin feat/...`, never force). Open the PR:
   ```
   gh pr create --fill --body-file .github/PULL_REQUEST_TEMPLATE.md
   ```
   then edit the body: fill the DoD checklist honestly and add `Closes #$ARGUMENTS`. Move the Project item to "In review" if `gh project` access is available; otherwise say so.

10. **Report**: what was built, test summary (counts and command output tail), gaps left open and why, PR URL. Do not merge.

## Stop conditions

- Issue contradicts `docs/01-domain.md` or an ADR: stop, explain the conflict, ask.
- Needs a secret or external resource not available (Supabase project, Railway): finish everything else, list what is blocked.
