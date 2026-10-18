# CLAUDE.md

Multi-tenant SaaS for small retail businesses in Bolivia (minimarkets first, pharmacies second): inventory, purchases, sales, expenses and accounts payable, owner capital, credit sales, and profit reports. Work is executed **issue by issue** from the GitHub Project "Mini Market v1". Issues are the specs; this file tells you how to execute them.

## Read first (in this order)

1. `docs/01-domain.md` — glossary EN→ES, business rules S1–S13, entities, permission matrix. **Never reinterpret an S-rule.**
2. `docs/02-architecture.md` — monorepo map, domain modules, dependency graph, layers, boundaries.
3. `docs/04-coding-standards.md` — clean code rules and review checklist.
4. `docs/05-security.md` and `docs/06-testing-strategy.md`.
5. `docs/adr/README.md` — decisions. Follow them; propose changes as a new ADR, never silently.
6. `docs/03-roadmap.md` — milestones and execution order.

## Monorepo

| Path | What |
|---|---|
| `apps/api` | NestJS 11 API. Domain modules under `src/modules/<domain>/{domain,application,infrastructure,presentation,index.ts}`. |
| `apps/web` | React 19 + Vite SPA. Features under `src/features/<domain>/{api,components,pages,index.ts}`. |
| `packages/shared-kernel` | Pure TS: `Money` (integer centavos), `Quantity`, `Period`, `Result`, `DomainError`, `Clock`. |
| `packages/contracts` | Zod request/response schemas per endpoint. Single source of the API contract (ADR 0017). |
| `packages/config` | Shared tsconfig, ESLint (boundaries), Prettier. |
| `e2e` | Playwright suites tagged `@M0`…`@M8`. |

## Commands (available after M0 is done)

```
pnpm dev            # api :3001 + web :5173
pnpm typecheck
pnpm lint           # includes module boundary rules
pnpm test           # vitest: api (PGlite) + web (Testing Library + MSW) + packages
pnpm e2e            # playwright; pnpm e2e --grep @M4 for one milestone
pnpm --filter api db:generate | db:migrate | db:studio
```

## Hard rules (break any of these and the PR is rejected)

1. **Tenant isolation**: every business table has `tenant_id` and an RLS policy. Every use case and repository receives an explicit `TenantContext`. Never read the tenant from a global.
2. **Money and quantities**: use `Money` and `Quantity` from `shared-kernel`. No raw `number` arithmetic on money. Money is stored as `bigint` centavos (ADR 0004).
3. **Ledgers are immutable**: never `UPDATE` or `DELETE` rows of `stock_movements`, `credit_ledger_entries`, `capital_movements`, `audit_log`. Corrections are reverse entries (S12).
4. **Module boundaries**: import other modules only through their `index.ts`, respecting the dependency graph in `docs/02-architecture.md`. `eslint-plugin-boundaries` enforces this; do not disable the rule.
5. **Layers**: `domain/` has no IO. `application/` holds one use case per file (`verb-noun.ts`, exports `verbNoun`). Controllers and pages contain no business logic (parse, call, map; ≤ 15 lines of logic).
6. **Errors**: expected failures return `Result<T, DomainError>`. Exceptions are for bugs and infrastructure only (ADR 0013).
7. **Authorization in use cases**, not only in UI. Employee DTOs never include cost, profit, capital or expenses.
8. **Validation**: Zod schemas from `packages/contracts` at every API boundary and every form.
9. **Language**: code, identifiers, comments, commits, docs and issues in **English**. **Every string the client sees is in Spanish**, provided through i18n (`apps/web/src/lib/i18n/es.json`) and API error messages mapped to Spanish in the web layer. Never hardcode UI text in components.
10. **Tests are part of the feature**: each acceptance criterion maps to a test marked `// AC-n`. Integration tests run against real Postgres (PGlite) with RLS on. Touching tenant data requires a tenant isolation test.
11. **Secrets**: never commit `.env*`. Service role keys exist only in the API environment.

## Workflow per issue

Use `/issue <number>`; it runs this flow:

1. `gh issue view <n>` — read the 8 sections. Check every issue in **Dependencies** is closed; if not, stop and say so.
2. Read the docs listed above and the ADRs the issue cites.
3. Enter plan mode; propose the plan per module/layer and the test list per AC. Wait for approval.
4. Branch `feat/<n>-<slug>` from `main`.
5. Implement. Add migrations (reversible), contracts, use cases, repositories, controllers, web feature, i18n strings, tests.
6. Run `pnpm typecheck && pnpm lint && pnpm test` (and `pnpm e2e --grep @Mn` for `[e2e]` issues).
7. `/verify-issue <n>` — spec and architecture review. Fix gaps.
8. Open a PR with the template; body includes `Closes #<n>`. Move the Project item to **In review**. Do not merge; do not push with `--force`.

Closing a milestone: `/close-milestone M<n>` runs the e2e suite for the tag, verifies all sub-issues are Done, and prints the epic's manual checklist for the human to run.

## Definition of Done (every issue)

- [ ] typecheck, lint, unit, integration green locally and in CI
- [ ] every AC has a test with `// AC-n`; `[e2e]` issues add `@Mn` tagged flows
- [ ] tenant isolation test present when tenant data is touched
- [ ] permissions covered: owner and employee cases
- [ ] no business logic in controllers, server handlers or React pages
- [ ] migrations reversible; no destructive change to ledgers
- [ ] Spanish i18n strings added for all new UI text
- [ ] `docs/` updated if a rule, module or decision changed (new ADR if a decision changed)
- [ ] PR opened with `Closes #<n>` and the DoD checklist filled

## What Claude Code does not decide

Business semantics (S1–S13), scope, priorities and anything the client sees are the owner's calls. If an issue contradicts `docs/01-domain.md` or an ADR, stop and ask instead of choosing.

## Conventions summary

- Conventional Commits: `feat(sales): confirm sale with COGS snapshot (#42)`. Commits are authored by the repository owner only: no AI co-author trailers or "Generated with" lines in commits or PR bodies.
- Files kebab-case; DB tables snake_case plural; REST `/api/v1/<resource>`; events PascalCase past tense (`SaleConfirmed`).
- Timestamps UTC in DB; periods computed in the tenant timezone via `Period` (ADR 0008).
