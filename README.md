# mini-market

Multi-tenant SaaS for small retail businesses (minimarkets, pharmacies and similar buy/sell shops): inventory, purchases, sales, expenses and accounts payable, owner capital, credit sales and profit reports. Built for Bolivia first. UI in Spanish, code in English.

## Layout

- `apps/api` — NestJS API (domain modules, Drizzle, Supabase Postgres with RLS)
- `apps/web` — React + Vite SPA
- `packages/*` — shared kernel, API contracts, shared config
- `e2e` — Playwright suites per milestone
- `docs` — vision, domain rules, architecture, standards, security, testing, ADRs

## Work is driven by GitHub issues

Milestones M0–M8 each deliver one testable module end to end. See `docs/03-roadmap.md` and the GitHub Project "Mini-Market". Developers and Claude Code execute issues in the `Order` field sequence. See `CLAUDE.md` for the per-issue workflow.

## Getting started

Node 22 (nvm) and pnpm 10.18 (`corepack enable`). The Supabase dev project credentials live outside the repository in `~/.mini-market/supabase-dev.env`; the format is in [docs/07-local-development.md](docs/07-local-development.md), which has the full guide, the manual M1 checklist and troubleshooting.

```
pnpm install
pnpm setup:env        # writes the gitignored apps/api/.env and apps/web/.env from the secrets file
pnpm turbo run build --filter=@mini-market/contracts --filter=@mini-market/shared-kernel
pnpm setup:db         # migrations, app_user login, RLS checks
pnpm setup:tenants    # two test businesses and their owners
pnpm dev              # api :3001 + web :5173
pnpm smoke:local      # in a second terminal: real sign-in, /me/tenants, 403 across tenants
```

Tests never touch Supabase: `pnpm test` (PGlite) and `pnpm e2e` (fake Supabase).
