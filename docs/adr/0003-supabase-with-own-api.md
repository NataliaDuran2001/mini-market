# ADR 0003: Supabase for Auth, Postgres and Storage behind an owned API

Status: Accepted, 2026-10-18

## Context

The fastest scalable backend path was evaluated among Firebase, Cloudflare (Workers + D1), Supabase used natively from the browser, Supabase as infrastructure behind an owned API, and a fully self-built stack.

## Decision

Use Supabase as managed infrastructure and keep all business logic in the NestJS API:

- Auth: Supabase Auth with email and password. The API validates JWTs against the project JWKS and resolves memberships itself.
- Postgres: the only database, accessed by the API through the pooler with role `app_user`. Drizzle owns schema and migrations, including RLS policies.
- Storage: CSV uploads in v1, logos in v2.
- Dashboard: operator admin panel in v1 (data inspection, provisioning, auth users).
- The browser uses `supabase-js` for authentication only. All data goes through the API.
- Two projects: `mini-market-dev` and `mini-market-prod`. Tests use PGlite, never Supabase.

## Consequences

- Authentication, password reset, backups and an admin panel come for free, saving several days of v1.
- Business rules, transactions and permissions remain in TypeScript where they are testable and bounded by modules.
- The platform depends on Supabase Auth; migrating away means re-issuing accounts. Acceptable.
- Cost near zero for two tenants; the Pro plan is needed for PITR and no project pausing in production.

## Alternatives considered

- Firebase: NoSQL without joins or aggregations; monthly reports, average cost and ledgers become fragile client code. Rejected.
- Cloudflare D1: SQLite without RLS, restricted runtime, less mature auth. Rejected as primary.
- Supabase native (browser to Postgres): fastest, but transactional use cases (confirm sale, register purchase) move to plpgsql, which is harder to test and structure. Rejected.
- Self-built (NestJS + Neon + Better Auth): maximum control, slowest. Rejected for v1.
