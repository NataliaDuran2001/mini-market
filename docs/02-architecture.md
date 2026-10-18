# 02 - Architecture

## 1. Shape

Modular monolith in a TypeScript monorepo. Two deployable apps (API and web), shared packages, one PostgreSQL database hosted on Supabase. Modules follow domain boundaries enforced by lint. A module can be extracted later because nothing outside it imports its internals.

## 2. Monorepo tree

```
mini-market/
├── apps/
│   ├── api/                         # NestJS 11, port 3001
│   │   ├── drizzle/                 # SQL migrations (schema + RLS policies)
│   │   └── src/
│   │       ├── modules/<domain>/    # domain/ application/ infrastructure/ presentation/ index.ts
│   │       ├── infrastructure/      # db, with-transaction, supabase-jwt, events, logger, config
│   │       └── main.ts
│   └── web/                         # React 19 + Vite 6, port 5173
│       └── src/
│           ├── features/<domain>/   # api/ components/ pages/ index.ts
│           ├── routes/              # TanStack file-based routes (thin: wire a feature page)
│           ├── locales/es/          # i18n: common.json + one <feature>.json per feature
│           ├── app/                 # router, providers, shell, role guards
│           ├── lib/                 # supabase client (auth only), api client, i18n
│           └── ui/                  # shadcn/ui primitives
├── packages/
│   ├── shared-kernel/               # Money, Quantity, Period, Result, DomainError, Clock, ids
│   ├── contracts/                   # Zod schemas and types per endpoint (single API contract)
│   └── config/                      # shared tsconfig, eslint (boundaries), prettier
├── e2e/                             # Playwright against running api + web
├── docs/                            # this folder, adr/
├── .github/                         # workflows, issue and PR templates, renovate
├── .claude/                         # harness: settings, skills, agents
├── CLAUDE.md
├── turbo.json  pnpm-workspace.yaml  package.json
```

Package names: `@mini-market/shared-kernel`, `@mini-market/contracts`, `@mini-market/config` (scope fixed in issue #2, 2026-10-18). The `@mm/...` spelling in the other docs and in the ADRs refers to the same packages.

## 3. Domain modules

| Module | Responsibility | Milestone |
|---|---|---|
| `shared-kernel` (package) | Money (integer centavos), Quantity, Period (tenant timezone), Result, DomainError, Clock, id generation | M0 |
| `tenancy` | Tenants, settings and modules, vertical presets, provisioning | M1 |
| `access` | Supabase user to membership link, roles, permissions, `TenantContext` | M1 |
| `audit` (cross-cutting) | Audit log of sensitive actions | M1 |
| `catalog` | Products, presentations, categories, units, payment methods, expense categories, CSV import | M2 |
| `inventory` | Immutable `stock_movements` ledger, stock levels, weighted average cost, adjustments, low-stock events | M2 to M3 |
| `purchasing` | Suppliers, purchases | M3 |
| `sales` | Sales, void, receipt numbering, sales of the day | M4 |
| `payables` | Expenses, recurring templates, monthly generation, payments, unified payables list | M5 |
| `equity` | Capital contributions and withdrawals | M6 |
| `reporting` | Daily report, monthly report, top products, CSV export. Read only. | M7 |
| `receivables` | Customers, credit ledger, collections | M8 |

## 4. Dependency graph (acyclic; "A -> B" means A uses the public API of B)

```
access      -> tenancy -> shared-kernel
audit       -> tenancy
catalog     -> tenancy
inventory   -> catalog
purchasing  -> inventory, payables
sales       -> catalog, inventory, receivables
payables    -> tenancy
equity      -> tenancy
receivables -> tenancy
reporting   -> read access to every module's exported schema (never writes)
```

## 5. Layers

### API module

```
apps/api/src/modules/sales/
├── domain/            # Pure TypeScript. Types, invariants, rules S1..S13. No IO, no Nest, no Drizzle.
├── application/       # One use case per file (confirm-sale.ts). Ports (interfaces). DTOs come from @mm/contracts.
├── infrastructure/    # Drizzle schema, repositories implementing ports, external adapters.
├── presentation/      # Nest controller and module wiring. Parse, call use case, map Result to HTTP.
└── index.ts           # Public API: use case tokens, types, exported schema for reporting.
```

### Web feature

```
apps/web/src/features/sales/
├── api/               # TanStack Query hooks typed with @mm/contracts
├── components/        # Presentational and container components
├── pages/             # Route components
└── index.ts           # Public API: pages and any shared component
```

## 6. Boundary rules (eslint-plugin-boundaries, fails CI)

| From | May import |
|---|---|
| `apps/api/src/modules/X/domain` | `@mm/shared-kernel` |
| `apps/api/src/modules/X/application` | own `domain`, `@mm/shared-kernel`, `@mm/contracts`, `modules/Y/index.ts` per the graph |
| `apps/api/src/modules/X/infrastructure` | own `domain` and `application`, `apps/api/src/infrastructure/*`, `@mm/shared-kernel` |
| `apps/api/src/modules/X/presentation` | own `application`, `@mm/contracts`, Nest |
| `apps/api/src/modules/reporting/infrastructure` | schemas exported by other modules' `index.ts` (documented read-only exception) |
| `apps/web/src/features/X` | own files, `@mm/contracts`, `@mm/shared-kernel`, `src/ui`, `src/lib`, `features/Y/index.ts` |
| `apps/web/src/app` | `features/*/index.ts`, `src/ui`, `src/lib` |
| `packages/shared-kernel` | nothing from apps or other packages |
| `packages/contracts` | `@mm/shared-kernel`, zod |

Importing another module's `domain`, `application` or `infrastructure` directly is a lint error.

The rules live in `packages/config/eslint/boundaries.mjs` (`MODULE_GRAPH` is section 4 as data). Conventions the preset encodes in addition to the table:

| Convention | Rule |
|---|---|
| Module root files | `index.ts` (public API) may import every layer of its own module. `<domain>.module.ts` and `<domain>.permissions.ts` wire the layers of their own module. |
| Drizzle schema | `infrastructure/schema.ts` of a module is re-exported by `apps/api/src/infrastructure/db/schema.ts`. |
| `access` | Every module may import the public API of `access` (`TenantContext`, permissions, `AuditPort`; issue #11). `tenancy` may import it with `import type` only, so the runtime graph stays acyclic. |
| API shared infrastructure | `apps/api/src/infrastructure/http` may be used by controllers (`presentation`). Other `infrastructure` folders may not. `infrastructure/*` may import the `TenantContext` type from `access`. `application` may import types (not runtime values) from `apps/api/src/infrastructure/*`, so a use case can name `WithTransaction` and the transaction handle it receives as dependencies. |
| Purity | `domain` imports no Nest, ORM, React, `node:*` or IO packages. `application` imports no ORM, Nest or React. `presentation` imports no ORM. |
| Test files | `*.test.ts`, `test/` and `__tests__/` are not checked. |

## 7. Cross-module orchestration

| Need | Mechanism |
|---|---|
| Atomic multi-module write (confirm sale: sale + stock movements + credit ledger) | The orchestrating use case runs inside `withTransaction(ctx, tx => ...)` and calls other modules' public use cases passing the same transaction handle. |
| Side effects after commit (low-stock alert, audit entry, future notifications) | In-process event bus. Events are collected during the transaction and dispatched after commit. Handlers are idempotent. |
| Reporting | SQL queries and views over module tables, read only, inside `reporting`. |

No external queue, no event sourcing, no saga framework in v1.

## 8. Supabase usage

| Service | How it is used |
|---|---|
| Auth | Email and password. The API validates JWTs against the project JWKS in a Nest guard, then resolves membership and role from the database to build `TenantContext`. The owner invites employees from the web; the API creates the user with the service role key (server side only). |
| Postgres | The only database. Drizzle owns schema and migrations under `apps/api/drizzle`, including RLS policies written in SQL. The API connects through the Supabase pooler with a dedicated role `app_user` that does not bypass RLS and runs `set_config('app.tenant_id', <id>, true)` at the start of every transaction. `TenantContext` is the first defense; RLS is the second. |
| Storage | Imported CSV files (v1), tenant logos (v2). |
| Dashboard | Operator admin panel in v1: inspect data, run the provisioning script, manage auth users. Avoids building a platform admin UI before v2. |
| Environments | Two Supabase projects: `mini-market-dev` and `mini-market-prod`. Automated tests never touch Supabase; they run against PGlite with the same migrations. |

## 9. Technology

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces, Turborepo |
| API | NestJS 11, Drizzle ORM + drizzle-kit, Zod via nestjs-zod, @nestjs/swagger for generated OpenAPI, nestjs-pino, @t3-oss/env-core, helmet |
| Web | React 19, Vite 6, TanStack Router, TanStack Query, react-hook-form + Zod, shadcn/ui + Tailwind 4, i18next (`es`), @supabase/supabase-js (auth only) |
| Shared | TypeScript 5 strict, Zod |
| Data and auth | Supabase: Postgres 15, Auth, Storage |
| Tests | Vitest + @electric-sql/pglite (API), Vitest + Testing Library + MSW (web), Playwright (e2e) |
| Quality | ESLint (typescript-eslint strict, eslint-plugin-boundaries, eslint-plugin-import-x), Prettier, Renovate, pnpm audit |
| CI/CD | GitHub Actions: typecheck, lint, test, build, migration check, audit |
| Other | papaparse (CSV), date-fns and date-fns-tz (Period) |

Exact versions are pinned in M0 and must be at least two weeks old at the time of pinning.

## 10. Deployment

| Component | Target | Notes |
|---|---|---|
| API | Railway | Node service, env vars per environment, runs migrations on deploy |
| Web | Vercel or Cloudflare Pages | Static build, `VITE_API_URL` and Supabase anon key per environment |
| Database, Auth, Storage | Supabase | dev and prod projects |
| Previews | Per PR for web; API previews optional | |

## 11. Request flow

1. Web obtains a Supabase session and sends `Authorization: Bearer <jwt>` and `X-Tenant-Id` to the API.
2. `SupabaseJwtGuard` verifies the token. `TenantContextInterceptor` loads the membership for (user, tenant) and builds `TenantContext` with role, permissions and settings snapshot.
3. Controller parses the body with the Zod schema from `@mm/contracts` and calls one use case.
4. Use case checks permission, runs domain logic, uses repositories inside `withTransaction` (which sets `app.tenant_id`), returns `Result`.
5. Controller maps `Ok` to the response DTO and `Err(DomainError)` to an HTTP status and a translated message key.

## 12. How it scales

| Future need | What changes | What does not |
|---|---|---|
| New vertical (hardware store, bookshop) | Preset in `tenancy`; new module only if it brings its own rules | Existing modules |
| Second language | Message files | Components |
| Dedicated database for a large tenant | Connection resolver in `apps/api/src/infrastructure/db` | Repositories (already receive `TenantContext`) |
| Reporting on a read replica or separate service | `reporting` DB adapter | Write-side modules |
| Team of three or more | One module per person | Boundary rules already allow it |
| Fiscal invoicing | New `invoicing` module subscribed to `SaleConfirmed` | `sales` |
| Barcode scanner | Search input in the `sales` web feature | Use cases |
| Lots, fractional sales (v2) | `inventory` and `catalog` internals plus module flags | Profit formulas (S3 stays) |
