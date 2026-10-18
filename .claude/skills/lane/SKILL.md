---
name: lane
description: Run one lane of issues in order, autonomously, merging each PR when CI and self-review are green. Usage - /lane P1
---

# /lane <name>

Execute the ordered issue list of one lane from `docs/lanes.md`. Argument: lane name (P1, P2, P3, C, S, B, R).

1. Read `docs/lanes.md` end to end. Find the lane row and its ordered issues. Read `CLAUDE.md`.
2. For each issue in order, follow **Protocol per issue** in `docs/lanes.md` exactly. This replaces the plan-mode approval of `/issue`: write the plan in the PR description and continue.
3. Use the Node 22 `PATH` export from `docs/lanes.md` in every Bash command.
4. Merge your own PR with `gh pr merge --squash --delete-branch` only when CI is green and the review agents report no blocking findings.
5. Do not start an issue whose dependencies are open. Wait with the polling loop, up to the limit in the doc, then report.
6. Stop and report when: an issue contradicts `docs/01-domain.md` or an ADR, a decision belongs to the owner, a secret or external resource is missing, or a rebase conflict is not obvious.
7. Finish with the **Lane report** from `docs/lanes.md`.
