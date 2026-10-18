---
name: verify-issue
description: Verify the current branch against a GitHub issue - maps every acceptance criterion to a test, runs the suites, and reviews architecture, security and boundaries. Usage - /verify-issue 42
---

# /verify-issue <number>

Independent verification of the work for an issue before the PR is opened or merged.

## Steps

1. Load the issue: `gh issue view $ARGUMENTS --json title,body`. Extract the list of acceptance criteria `AC-1..AC-n` and the *Tests required* section.

2. Launch two review agents **in parallel** (Agent tool), giving each the issue body and `git diff main...HEAD --stat` plus the changed files:
   - `spec-reviewer`: for each AC find the test that covers it (search for `// AC-n` and by behavior), judge whether the test actually proves the criterion, and list ACs without a real test.
   - `architecture-reviewer`: check module boundaries, layer purity, `TenantContext` and RLS usage, `Money`/`Quantity` usage, `Result` error handling, permissions enforced in use cases, employee DTOs without sensitive fields, Zod at boundaries, no hardcoded UI strings (Spanish via i18n), ledger immutability, migration reversibility, and the OWASP checklist in `docs/05-security.md`.

3. Run the gates yourself and capture output: `pnpm typecheck`, `pnpm lint`, `pnpm test`; `pnpm e2e --grep @M<n>` when the issue is `[e2e]` or the agents ask for it.

4. Produce the report:

   | AC | Test (file :: name) | Result | Verdict |
   |---|---|---|---|

   followed by an **Architecture and security findings** table (file:line, rule, severity blocking or minor, fix) and a **Gates** block with the tail of each command output.

5. Verdict: `READY` only when every AC has a passing test and there are no blocking findings. Otherwise `NOT READY` with the ordered fix list. Never soften a failing gate.
