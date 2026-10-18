---
name: close-milestone
description: Check whether a milestone (M0..M8) can be closed - all issues done, e2e suite for its tag green, and print the epic manual end-to-end checklist. Usage - /close-milestone M4
---

# /close-milestone <Mn>

1. Find the milestone and its issues (milestone titles start with the key, e.g. `M4 - Sales`):
   ```
   gh api "repos/{owner}/{repo}/milestones?state=all" --jq '.[] | "\(.number)\t\(.title)"'
   gh issue list --milestone "<full title>" --state all --json number,title,state,labels --limit 100
   ```
   Any issue not `CLOSED` (except the epic itself) blocks closing. List them.

2. Run the automated gate on `main`: `git switch main && git pull && pnpm install && pnpm test && pnpm e2e --grep @$ARGUMENTS`. Paste the tail of the output.

3. Print the epic section **End-to-end test (manual checklist, API + web)** verbatim from the epic issue (label `type:epic` in this milestone) so the owner can run it against the deployed environment.

4. Verdict: `CAN CLOSE` (all issues closed, gates green; the human still runs the manual checklist) or `CANNOT CLOSE` with the blockers. If `CAN CLOSE` and the human confirms the manual checklist passed, close the epic and the milestone:
   ```
   gh issue close <epic-number>
   gh api -X PATCH "repos/{owner}/{repo}/milestones/<milestone-number>" -f state=closed
   ```
