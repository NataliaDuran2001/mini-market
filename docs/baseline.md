# Baseline

Frozen on 2026-10-18. Progress is measured against this file. It does not change silently: any change goes in the change log at the end with date, reason and approver. Machine-readable copy: `docs/baseline.json`. Progress report: `node scripts/baseline-status.mjs`.

## 1. Scope baseline

| Item | Count |
|---|---|
| Milestones in v1 | 9 (M0 to M8) |
| Issues in v1 | 51 |
| Epics in v1 | 9 |
| v2 epics, not scheduled | 6 |

What the client asked for is covered by M2 to M7: product inventory, daily sales, monthly reports, initial capital, accounts payable and real profit. M8 (credit sales) and M1 (roles and tenants) come from the owner. Cut line if scope must shrink: M8 first, then M6.

## 2. Business baseline (sequential, client-facing)

One person with Claude Code, one issue after another. A plan day is the estimate unit of the issues, about 6 effective hours.

| Milestone | Issues | Plan days | Cumulative | Due date |
|---|---|---|---|---|
| M0 - Scaffold & harness | 6 | 2 | 2 | 2026-10-21 |
| M1 - Foundation: tenants, auth, roles | 8 | 3 | 5 | 2026-10-26 |
| M2 - Products & stock | 8 | 3 | 8 | 2026-10-29 |
| M3 - Purchases | 5 | 3 | 11 | 2026-11-03 |
| M4 - Sales | 6 | 4 | 15 | 2026-11-09 |
| M5 - Expenses & accounts payable | 5 | 3 | 18 | 2026-11-12 |
| M6 - Capital | 3 | 1 | 19 | 2026-11-13 |
| M7 - Reports | 5 | 3 | 22 | 2026-11-18 |
| M8 - Credit sales (fiado) | 5 | 2 | 24 | 2026-11-20 |

| Item | Plan days |
|---|---|
| Development M0 to M8 | 24 |
| Go-live at the minimarket: real Excel load, training, first-week fixes | 3 |
| v1 in production | 27, around 2026-11-25 |

Due dates assume full-time work from 2026-10-19 and do not count the 2026-11-02 holiday in Bolivia.

## 3. Lane baseline (parallel)

Same scope, executed by parallel lanes as defined in `docs/lanes.md`. Planned start and finish are in plan days from lane start, computed by simulating each lane in order over the real issue dependencies. Lane start (T0): 2026-10-18, recorded at 17:23 UTC when the first three lanes were running.

| Item | Plan days |
|---|---|
| Sequential total | 24 |
| Critical path with 7 lanes, lower bound | 8.25 |

This is a lower bound. It adds no buffer for merge waits, CI failures, rework or the owner's testing time. Calendar days per plan day are not known yet: the rule in section 4 calibrates them.

### Planned finish per milestone

| Milestone | Planned finish, plan day |
|---|---|
| M0 - Scaffold & harness | 1.75 |
| M1 - Foundation: tenants, auth, roles | 2.75 |
| M2 - Products & stock | 5.5 |
| M3 - Purchases | 7 |
| M4 - Sales | 7.75 |
| M5 - Expenses & accounts payable | 6.75 |
| M6 - Capital | 3.25 |
| M7 - Reports | 8.25 |
| M8 - Credit sales (fiado) | 8 |

### Planned finish per lane

| Lane | Issues | Plan days of work | Planned finish, plan day |
|---|---|---|---|
| P1 | 6 | 2.25 | 2.5 |
| P2 | 4 | 1.5 | 2.75 |
| P3 | 4 | 1.25 | 1.75 |
| C | 13 | 5.5 | 8 |
| S | 9 | 5 | 7.75 |
| B | 8 | 4.5 | 6.75 |
| R | 7 | 4 | 8.25 |

### Planned schedule per issue

| Issue | Lane | Title | Est. | Start | Finish |
|---|---|---|---|---|---|
| #2 | P1 | [infra] Monorepo: pnpm workspaces, Turborepo, shared config, root scripts | 0.25 | 0 | 0.25 |
| #3 | P1 | [api] NestJS skeleton: validated env, pino, Helmet, CORS, health, Drizzle + PGlite test harness | 0.5 | 0.25 | 0.75 |
| #4 | P2 | [web] Vite + React skeleton: router, query, shadcn/ui, i18n es, empty layout, Testing Library + MSW | 0.5 | 0.25 | 0.75 |
| #5 | P3 | [shared] shared-kernel (Money, Quantity, Period, Result, DomainError, Clock) with tests; contracts package scaffold | 0.25 | 0.25 | 0.5 |
| #6 | P3 | [infra] CI: typecheck, lint (boundaries), test, build, audit; Renovate; main branch protection | 0.25 | 1.25 | 1.5 |
| #7 | P3 | [infra] Initial deploy: API on Railway, web on Vercel, per-environment variables | 0.25 | 1.5 | 1.75 |
| #9 | P1 | [api] Supabase JWT guard, CurrentUser decorator, employee invitation via service role | 0.25 | 0.75 | 1 |
| #10 | P3 | [api] tenancy: tenants table, settings JSONB (vertical, modules, flags, timezone), presets minimarket/farmacia/generic | 0.5 | 0.75 | 1.25 |
| #11 | P1 | [api] access: memberships, roles owner/employee, TenantContext, permission matrix, @RequirePermission | 0.5 | 1.25 | 1.75 |
| #12 | P1 | [api] RLS: app_user role, set_config(app.tenant_id) inside withTransaction, policies in migration, reusable isolation test | 0.5 | 1.75 | 2.25 |
| #13 | P1 | [api] Tenant provisioning script: tenant + owner + preset catalogs | 0.25 | 2.25 | 2.5 |
| #14 | P2 | [web] Auth: login, logout, password recovery, accept invitation; API client with token; role guards | 0.5 | 1.75 | 2.25 |
| #15 | P2 | [web] App shell: navigation by enabled modules, tenant switcher, role-aware menu | 0.25 | 2.25 | 2.5 |
| #16 | P2 | [e2e] M1: owner/employee login, tenant isolation across two tenants (@M1) | 0.25 | 2.5 | 2.75 |
| #18 | C | [api] Tenant catalogs: categories, units, payment methods, expense categories (CRUD, preset seed) | 0.25 | 2.5 | 2.75 |
| #19 | C | [api] Products and presentations (factor 1 default), search by name/code, activate/deactivate | 0.5 | 2.75 | 3.25 |
| #20 | C | [api] inventory: immutable stock_movements ledger, stock levels, initial stock, adjustments with reason, StockBelowMinimum event | 0.5 | 3.25 | 3.75 |
| #21 | C | [api] CSV import: validation, preview, confirm, per-row errors (products + initial stock) | 0.5 | 4.25 | 4.75 |
| #22 | C | [web] Catalog settings screens (categories, units, payment methods, expense categories) | 0.25 | 4.75 | 5 |
| #23 | C | [web] Products: searchable list, quick create/edit, current stock, adjustment dialog | 0.5 | 3.75 | 4.25 |
| #24 | C | [web] CSV import wizard: upload, map columns, review errors, confirm | 0.25 | 5 | 5.25 |
| #25 | C | [e2e] M2: import CSV, search, adjust stock (@M2) | 0.25 | 5.25 | 5.5 |
| #27 | B | [api] Suppliers CRUD | 0.25 | 2.25 | 2.5 |
| #28 | B | [api] Purchases: lines, cash/credit, purchase movements, weighted average cost recalculation (S3), payable creation (S9) | 1 | 4.25 | 5.25 |
| #29 | B | [web] Suppliers screen | 0.25 | 2.5 | 2.75 |
| #30 | C | [web] Register purchase: product search, quantity, cost, totals, cash/credit, history | 1 | 5.5 | 6.5 |
| #31 | C | [e2e] M3: credit purchase updates stock, average cost and creates a debt (@M3) | 0.5 | 6.5 | 7 |
| #33 | S | [api] sales: confirm sale (lines, payment method, COGS snapshot, S13), void (S12), per-tenant receipt numbering | 1 | 3.75 | 4.75 |
| #34 | S | [api] Sales of the day: list and totals by payment method | 0.5 | 4.75 | 5.25 |
| #35 | S | [web] Sale screen: fast search, cart, quantities, payment method, confirm (mobile-first) | 1 | 5.25 | 6.25 |
| #36 | S | [web] Internal receipt (print/share) and void with reason | 0.5 | 6.25 | 6.75 |
| #37 | S | [web] Sales of the day: list, filters, totals; employee without cost or profit | 0.5 | 6.75 | 7.25 |
| #38 | S | [e2e] M4: sell, stock decreases, receipt, void restores (@M4) | 0.5 | 7.25 | 7.75 |
| #40 | B | [api] Expenses: one-off and recurring templates, monthly generation (S5), partial/total payments | 1 | 2.75 | 3.75 |
| #41 | B | [api] Unified accounts payable: expenses + credit purchases, overdue/upcoming, pay | 0.5 | 5.25 | 5.75 |
| #42 | B | [web] Expenses: list by month, create, recurring templates | 0.5 | 3.75 | 4.25 |
| #43 | B | [web] Accounts payable: unified list, pay, filters, supplier balance | 0.5 | 5.75 | 6.25 |
| #44 | B | [e2e] M5: recurring expense appears next month; pay a purchase debt (@M5) | 0.5 | 6.25 | 6.75 |
| #46 | S | [api] equity: capital contributions and withdrawals, totals (S8), owner only | 0.5 | 2.25 | 2.75 |
| #47 | S | [web] Capital: list, record movement, totals | 0.25 | 2.75 | 3 |
| #48 | S | [e2e] M6: record capital movements and verify totals (@M6) | 0.25 | 3 | 3.25 |
| #50 | R | [api] Daily sales report: per day and payment method, count, total, COGS, gross profit | 0.5 | 5.25 | 5.75 |
| #51 | R | [api] Monthly report: sales, COGS, gross profit (S1), accrued expenses, net profit (S2), receivables/payables pending, capital, equity; top products | 1 | 5.75 | 6.75 |
| #52 | R | [api] CSV export of daily and monthly reports | 0.25 | 6.75 | 7 |
| #53 | R | [web] Reports screens: day/month selectors, cards and tables, owner only | 1 | 7 | 8 |
| #54 | R | [e2e] M7: full scenario (purchase, sales, expense, capital) yields exact report numbers (@M7) | 0.25 | 8 | 8.25 |
| #56 | R | [api] receivables: customers, credit ledger, collections, optional credit limit | 0.5 | 2.75 | 3.25 |
| #57 | C | [api] Credit sales integration: payment method credit requires customer (S6); void reverses charge; report receivables | 0.5 | 7 | 7.5 |
| #58 | R | [web] Customers and statement, register collection, balances list | 0.5 | 3.25 | 3.75 |
| #59 | C | [web] Sale screen: credit path (customer picker, limit warning) | 0.25 | 7.5 | 7.75 |
| #60 | C | [e2e] M8: credit sale, balance, collection, void reversal (@M8) | 0.25 | 7.75 | 8 |

## 4. How progress is measured

1. `node scripts/baseline-status.mjs` reads `docs/baseline.json` and the closed dates of the issues on GitHub. It prints, per milestone and per lane, issues closed, plan days done, elapsed calendar days since T0 and the observed pace in calendar days per plan day.
2. Calibration rule: when M1 closes, take the observed pace and forecast the remaining plan days with it. Report the forecast next to the baseline, never in place of it.
3. A milestone counts as done only when all its issues are closed and its end-to-end tag passes. The owner's manual checklist in the epic is the final gate.
4. Variance is reported as forecast finish minus baseline finish per milestone, in calendar days.

## 5. Change log

| Date | Change | Reason | Approved by |
|---|---|---|---|
| 2026-10-18 | Baseline frozen: 51 issues, 9 milestones, 7 lanes | Initial plan | Natalia |
| 2026-10-19 | Issue #7 (initial deploy) deferred to the milestone Go-live. M0 closes without it. Plan days of #7 stay in the baseline totals, reported separately | Owner wants the local environment first and hosting decided after a stable v1 | Natalia |

### Unplanned work discovered during execution

Tracked next to the baseline, not inside it. The baseline numbers above do not change.

| Date | Item | Plan days | Found by | Reason |
|---|---|---|---|---|
| 2026-10-18 | Shared foundations: integer `moneySchema`, `Period` day range helper, docs corrections | 0.25 | Lane P3 report | Lanes C, S, B and R need them before their first money field and day boundary |
