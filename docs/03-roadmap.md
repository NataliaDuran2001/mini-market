# 03 - Roadmap

Source of truth for execution is the GitHub Project "Mini Market v1" and its issues. This file is the map. Links are filled once milestones and epics exist.

## Milestones v1

Each milestone closes with a complete module testable end to end: API, web and Playwright e2e tagged `@Mn`, plus the manual checklist in the epic issue.

| Milestone | Deliverable | Testable outcome | Issues | Days | Cumulative | Links |
|---|---|---|---|---|---|---|
| M0 Scaffold and harness | Monorepo, API and web skeletons, shared packages, CI, initial deploy | `pnpm dev` starts API and web; CI green on main | 6 | 2 | 2 | (pending) |
| M1 Foundation: tenants, auth, roles | Supabase auth, tenants, memberships, roles, RLS, module settings, provisioning, app shell | Two tenants with owner and employee; login; each sees only its data | 7 + e2e | 3 | 5 | (pending) |
| M2 Products and stock | Catalogs, products, presentations, stock ledger, adjustments, CSV import | Catalog loaded from the client Excel, stock visible and adjustable | 8 | 3 | 8 | (pending) |
| M3 Purchases | Suppliers, purchases, weighted average cost, payable on credit purchase | A credit purchase updates stock, cost and appears as a debt | 5 | 3 | 11 | (pending) |
| M4 Sales | Sale screen, receipt, void, sales of the day | Sell from phone or PC, print receipt, void, see the day | 6 | 4 | 15 | (pending) |
| M5 Expenses and accounts payable | Expenses, recurring templates, monthly generation, unified payables | Fixed monthly expenses and supplier debts in one list with due dates | 5 | 3 | 18 | (pending) |
| M6 Capital | Contributions and withdrawals | Capital total and equity visible to the owner | 3 | 1 | 19 | (pending) |
| M7 Reports | Daily report, monthly report, top products, CSV export | Gross and net profit for a month match a hand reconciliation | 5 | 3 | 22 | (pending) |
| Rollout | Load real Excel, train the client, first-week fixes | Minimarket operating | 0 | 3 | 25 | n/a |
| M8 Credit sales (fiado) | Customers, credit ledger, collections, credit path in sale screen | Sell on credit, see balance, collect | 5 | 2 | 27 | (pending) |

Phase 0 (this repository, docs, harness, Project and issues) is 1 day and precedes M0. Total to v1 complete: 28 working days.

## Cut line

If the deadline slips, cut in this order: M8 first, then M6. Both re-enter later without schema changes because the model already contains them.

## Calendar (honest, no hidden buffers)

Assumptions: one person full time (about 6 effective hours per day working with Claude Code), Supabase dev project created before M1, no scope changes.

| Business milestone | Working days | Calendar |
|---|---|---|
| Minimarket operating with everything the client asked for (M0 to M7 plus rollout) | 26 | about 5 weeks |
| v1 complete including credit sales | 28 | about 6 weeks |
| v2 pharmacy (lots, fractional, pharmacy onboarding) | +9 | +2 weeks |

A one-month target does not fit the full client scope. In 4 weeks M5 closes (sell, buy, stock, expenses) and M7 lands in week 5. Part-time work doubles every figure.

## Issues per milestone

Title prefixes: `[api]`, `[web]`, `[shared]`, `[infra]`, `[e2e]`, `[docs]`.

### M0 Scaffold and harness
1. `[infra]` Monorepo: pnpm workspaces, Turborepo, shared config, root scripts
2. `[api]` NestJS skeleton: validated env, pino, Helmet, CORS, health, Drizzle + PGlite test harness
3. `[web]` Vite + React skeleton: router, query, shadcn, i18n `es`, empty layout, Testing Library + MSW
4. `[shared]` `shared-kernel` (Money, Quantity, Period, Result, DomainError, Clock) with tests; `contracts` package with build
5. `[infra]` CI: typecheck, lint (boundaries), test, build, audit; Renovate; `main` protection
6. `[infra]` Initial deploy: API on Railway, web on Vercel or Pages, env vars per environment

### M1 Foundation
1. `[api]` Supabase JWT guard and `CurrentUser`; employee invitation with service role
2. `[api]` `tenancy`: tenants table, settings JSONB (vertical, modules, allowNegativeStock, employeeCanVoid, timezone), presets
3. `[api]` `access`: memberships, roles, `TenantContext`, permission matrix, `@RequirePermission`
4. `[api]` RLS: role `app_user`, `set_config` in `withTransaction`, policies in migration, reusable isolation test
5. `[api]` Tenant provisioning script (tenant + owner + preset catalogs)
6. `[web]` Auth: login, logout, password recovery, accept invitation; API client with token; role guard
7. `[web]` App shell: navigation by active modules, tenant switcher, role-aware menu
8. `[e2e]` M1: owner and employee login, tenant isolation

### M2 Products and stock
1. `[api]` Tenant catalogs: categories, units, payment methods, expense categories (CRUD, preset seed)
2. `[api]` Products and presentations (factor 1 default), search by name or code, activate or deactivate
3. `[api]` `inventory`: `stock_movements` ledger, stock levels, `initial` movement, adjustments with reason, `StockBelowMinimum` event
4. `[api]` CSV import: validation, preview, confirm, per-row errors
5. `[web]` Catalog settings screens
6. `[web]` Products: list with search, quick create and edit, current stock, adjustment
7. `[web]` CSV import wizard (upload, map columns, review errors, confirm)
8. `[e2e]` M2: import CSV, search, adjust stock

### M3 Purchases
1. `[api]` Suppliers CRUD
2. `[api]` Purchases: create with lines, cash or credit, `purchase` movements, average cost recalculation (S3), `Payable` creation (S9)
3. `[web]` Suppliers
4. `[web]` Register purchase (search product, quantity, cost, total), history
5. `[e2e]` M3: credit purchase updates stock, cost and debt

### M4 Sales
1. `[api]` `sales`: confirm sale (lines, payment method, COGS snapshot, S13), void (S12), receipt numbering
2. `[api]` Sales of the day: list and totals by payment method
3. `[web]` Sale screen: quick search, cart, quantity, payment method, confirm; phone first
4. `[web]` Internal receipt (print or share) and void with reason
5. `[web]` Sales of the day: list, filters, total; employee view without cost or profit
6. `[e2e]` M4: sell, stock decreases, receipt, void reverses

### M5 Expenses and accounts payable
1. `[api]` Expenses: one-off and recurring templates, monthly generation (S5), partial and full payments
2. `[api]` Unified payables (expenses + credit purchases), overdue and upcoming, mark paid
3. `[web]` Expenses: list by month, create, recurring
4. `[web]` Payables: list, pay, filters
5. `[e2e]` M5: recurring expense appears next month; pay a purchase debt

### M6 Capital
1. `[api]` `equity`: contributions and withdrawals, totals (S8); owner only
2. `[web]` Capital: list, create, total
3. `[e2e]` M6

### M7 Reports
1. `[api]` Daily report: by day and payment method, count, total, COGS, gross profit
2. `[api]` Monthly report: sales, COGS, gross (S1), accrued expenses, net (S2), pending collection and payment, capital, equity; top products
3. `[api]` CSV export of both
4. `[web]` Report screens with day or month selector, cards and tables; owner only
5. `[e2e]` M7: full scenario (purchase, sales, expense, capital) produces exact expected numbers

### M8 Credit sales (fiado)
1. `[api]` `receivables`: customers, credit ledger, collections, optional limit
2. `[api]` Sales integration: `credit` method requires a customer (S6); void reverses
3. `[web]` Customers and account statement, register collection
4. `[web]` Sale screen: credit path
5. `[e2e]` M8

## v2 backlog (epics only, no issues yet)

| Epic | Modules | Estimate (days) |
|---|---|---|
| Lots and expiry dates (`lots`) | inventory, reporting | 4 |
| Fractional sales (`fractional`) | catalog, sales | 3 |
| Pharmacy tenant onboarding | tenancy, catalog | 2 |
| Custom product fields (`custom_fields`) | catalog | 3 |
| Tenant branding | tenancy, sales web | 1 |
| Platform admin panel | platform | 3 |
