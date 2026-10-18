# Architecture Decision Records

One file per decision. Status values: Proposed, Accepted, Superseded. New decisions get the next number; superseding an ADR adds a note to the old one instead of editing its content.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-shared-postgres-rls-tenancy.md) | Shared PostgreSQL with Row Level Security for multi-tenancy | Accepted |
| [0002](0002-typescript-monorepo-nest-react.md) | TypeScript monorepo with a NestJS API and a React web app | Accepted |
| [0003](0003-supabase-with-own-api.md) | Supabase for Auth, Postgres and Storage behind an owned API | Accepted |
| [0004](0004-money-centavos-quantity-numeric.md) | Money as integer centavos, quantities as numeric(14,3) | Accepted |
| [0005](0005-immutable-stock-ledger.md) | Immutable stock ledger | Accepted |
| [0006](0006-tenant-modules-and-presets.md) | Tenant modules and vertical presets | Accepted |
| [0007](0007-configurable-catalogs.md) | Configurable catalogs per tenant | Accepted |
| [0008](0008-utc-timestamps-tenant-timezone-periods.md) | UTC timestamps and tenant-timezone periods | Accepted |
| [0009](0009-modular-monolith-enforced-boundaries.md) | Modular monolith by domain with enforced boundaries | Accepted |
| [0010](0010-tests-against-real-postgres-pglite.md) | Tests against real PostgreSQL via PGlite | Accepted |
| [0011](0011-hosting.md) | Hosting on Railway, Vercel or Cloudflare Pages, and Supabase | Accepted |
| [0012](0012-english-code-spanish-ui.md) | English for code and documentation, Spanish UI via i18n | Accepted |
| [0013](0013-result-type-error-handling.md) | Result type for expected errors | Accepted |
| [0014](0014-cross-module-orchestration.md) | Cross-module orchestration in one transaction plus post-commit events | Accepted |
| [0015](0015-security-baseline.md) | Security baseline | Accepted |
| [0016](0016-testability-and-ports.md) | Testability through ports and injected dependencies | Accepted |
| [0017](0017-shared-contracts-package.md) | Shared contracts package as the single API contract | Accepted |
