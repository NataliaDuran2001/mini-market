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

## Getting started (after milestone M0)

```
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```
