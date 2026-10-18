# @mini-market/api

NestJS 11 API. Architecture: `docs/02-architecture.md`. Rules: `docs/04-coding-standards.md`, `docs/05-security.md`.

## Commands

| Command | What |
|---|---|
| `pnpm --filter @mini-market/api dev` | API with reload (`node --watch` and SWC). Reads `.env`; `ENV_FILE` points elsewhere. |
| `pnpm --filter @mini-market/api test` | Vitest with coverage gates (80% on `domain` and `application`). Integration tests use PGlite, never Supabase. |
| `pnpm --filter @mini-market/api build` / `start` | `tsc` to `dist/`, then `node dist/main.js`. Needs Node 22.12 or newer (`require(esm)`). |
| `pnpm --filter @mini-market/api nest:module <name>` | Creates a module folder (see below). |
| `pnpm --filter @mini-market/api db:generate` | Generates a SQL migration from the schema registry into `drizzle/`. |

Configuration is validated at startup (`src/infrastructure/config/env.ts`); copy `.env.example` to `.env`. The port comes from `API_PORT`, then `PORT`, then 3001.

## Module convention

```
src/modules/<domain>/
├── domain/             pure TypeScript, rules S1..S13
├── application/        one use case per file, ports, injection tokens
├── infrastructure/     repositories; schema.ts holds the Drizzle tables
├── presentation/       Nest controllers and DTOs
├── <domain>.module.ts  Nest wiring for this module
└── index.ts            public API; the only file other modules may import
```

Adding a module, in this order:

1. `pnpm --filter @mini-market/api nest:module <name>`.
2. Add one import and one entry to `src/app.modules.ts`, sorted alphabetically.
3. Add one `export * from '../../modules/<name>/infrastructure/schema';` line to `src/infrastructure/db/schema.ts`, sorted alphabetically.

Those two files merge with git's `union` driver (`.gitattributes`): both sides are kept. `test/conventions.test.ts` fails when a module is missing, listed twice or out of alphabetical order.

### Migrations

Migration files carry a timestamp prefix (`drizzle.config.ts`), but `drizzle/meta/_journal.json` and the snapshots are shared state. When another branch merged a migration before yours:

1. `git rebase origin/main`.
2. Delete your generated `.sql`, snapshot and journal entry.
3. `pnpm --filter @mini-market/api db:generate` again, so the new snapshot builds on the merged one.

`test/conventions.test.ts` checks that journal timestamps increase and that every entry has its SQL file and its rollback. Never edit an applied migration.

Rollback: drizzle-kit has no down migrations, so every migration `drizzle/<tag>.sql` is accompanied by `drizzle/rollback/<tag>.sql` with the statements that undo it (Definition of Done: "migrations reversible"). Ledger tables are never rolled back by deleting rows.

Boundaries are enforced by lint (`packages/config/eslint/boundaries.mjs`). Controllers import `src/infrastructure/http` only; use cases receive their dependencies as ports and are provided in `<domain>.module.ts`.

Request bodies are limited to 1 MB (JSON). CSV import (5 MB, docs/05-security.md) must use multipart upload or a route level limit, not the JSON parser.

## Authentication

Every route needs `Authorization: Bearer <Supabase access token>` unless its controller or handler carries `@Public()` (both come from `modules/access`). `SupabaseJwtGuard` verifies signature (RS256 or ES256 from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached and refetched on key rotation), issuer, audience `authenticated` and expiry, then `@CurrentUser()` gives `{ userId, email }`. A rejected token answers `401 { code: "UNAUTHENTICATED" }` and logs a warning with a reason code, never the token.

## Database roles and row level security

The API connects as `app_user` (`DATABASE_URL`), a role without `BYPASSRLS`. Migrations and the provisioning script use the owner role (`MIGRATION_DATABASE_URL`). The `rls_app_user` migration creates `app_user` as `NOLOGIN`; in Supabase the operator runs `ALTER ROLE app_user LOGIN PASSWORD '...'` once, by hand, so no secret is in the repository.

- `withTransaction(scope, fn)` binds `app.tenant_id` (and `app.user_id`) with `set_config(..., true)` as the first statement, so the binding ends with the transaction and is safe behind the Supabase pooler in transaction mode. `scope` is a `TenantContext`, or `{ tenantId, events }` / `{ userId, events }` for the few reads that happen before a context exists. With `null` a tenant table answers zero rows and rejects writes (fail closed) instead of throwing.
- A new business table: declare it with `tenantTable('name', columns)` (adds `tenant_id` referencing `tenants` and an index that starts with it), then in its migration `SELECT app.enable_tenant_rls('public.name');` and explicit `GRANT`s to `app_user` (never `UPDATE`, `DELETE` or `TRUNCATE` on a ledger). `test/integration/rls.test.ts` fails for a table without the helper or without a policy.
- Every repository calls `expectTenantIsolation` from `test/isolation.ts` once.
- Tests run as `app_user` too: `testDb.withTransaction` switches role with `SET LOCAL ROLE`, `createTestApp` does the same for the whole app. Seed with `testDb.asAdmin` (the owner role, like provisioning); raw `testDb.client` queries are superuser and bypass RLS, which is what assertions about stored rows want.

## Tenant and permissions

After the JWT guard, `TenantGuard` runs on every route that is not `@Public()` or `@WithoutTenant()`: it reads `X-Tenant-Id`, checks an active membership and builds a `TenantContext` (`tenantId`, `userId`, `role`, `settings` snapshot, `permissions`, `events`, `can(permission)`). A controller receives it with `@Ctx()` and passes it to exactly one use case; use cases and repositories take it as an explicit parameter.

```ts
// sales.permissions.ts
export const SALES_PERMISSIONS = {
  'sales.create': { owner: true, employee: true },
  'sales.void': { owner: true, employee: (settings) => settings.employeeCanVoid },
} as const satisfies PermissionDefinitions;

// sales.module.ts: providers: [permissionsProvider('sales', SALES_PERMISSIONS), ...]
// controller: @RequirePermission('sales.void') voidSale(@Ctx() ctx: TenantContext, ...)
// use case:   const allowed = requirePermission(ctx, 'sales.void'); if (!allowed.ok) return allowed;
```

Never put an employee grant on a permission about cost, profit, capital, expenses or reports: `test/integration/permission-registry.test.ts` fails the build. `AUDIT_PORT` (from `modules/access`) appends to the audit log inside the caller's transaction.

Errors reach the client only through `ApiExceptionFilter` (`src/infrastructure/http`): controllers `throw result.error` for an `Err`, and the filter keeps the `code` and status of a `DomainError`, adds `requestId`, and answers 500 without internals for anything else. Log a failure with `describeError(error)`, not the raw error: drizzle puts the bound query parameters in the message.

## Tests

- `src/**/*.test.ts`: unit tests next to the code.
- `test/harness.ts`: `createTestDb()` starts PGlite and applies every migration from `drizzle/`; call `truncateAll()` in `beforeEach`. One database per test file. It connects as the PGlite superuser; issue #12 adds the `app_user` role and RLS to it.
- `test/create-test-app.ts`: boots the app exactly like `main.ts` on that database, for supertest. The app trusts a local key pair, so send `await bearerFor(app, { sub, email })` as `Authorization`; routes marked `@Public()` need nothing. `overrides` replaces providers by token (for example the Supabase admin client).
- `test/access-fixture.ts`: `useAccessApp()` registers the hooks of a suite that exercises the guard (fresh app per test, fake Supabase admin, fake membership directory).

## Provisioning a tenant

Onboarding is manual in v1 (`docs/00-vision.md`). The operator runs, with the owner role in `MIGRATION_DATABASE_URL` and `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `WEB_ORIGIN` set (in `apps/api/.env` or the shell):

```
pnpm --filter @mini-market/api provision -- --name "Mini Market Doña X" --slug minimarket-x --preset minimarket --owner-email owner@example.com
```

It creates the tenant with the settings of the preset (`minimarket`, `farmacia`, `generic`), invites the owner in Supabase Auth when the address has no account (the email lands on `/reset-password` to set a password), makes the owner a member, runs the registered catalog seeders and records `tenant.provisioned` in the audit log. Running it again with the same slug creates nothing and exits 0; if a previous run stopped before the owner step, the next run completes it. An invalid option or preset prints the usage and exits 1.

Catalog seeders are registered with `registerCatalogSeeder` from `modules/tenancy` (the catalog module does it in issue #18). Each one runs in a transaction bound to the new tenant and must be idempotent. The list is empty until then.
