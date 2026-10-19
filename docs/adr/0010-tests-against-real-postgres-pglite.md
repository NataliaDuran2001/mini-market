# ADR 0010: Tests against real PostgreSQL via PGlite

Status: Accepted, 2026-10-18

## Context

Tenant isolation relies on RLS and SQL. Mocked repositories cannot prove RLS policies, constraints or query correctness. The developer works on Windows where Docker is friction.

## Decision

- Integration tests for use cases and repositories run against `@electric-sql/pglite`, an in-process PostgreSQL. Real migrations are applied; role `app_user` and RLS are active.
- One PGlite instance per test file, truncation between tests.
- Domain logic is tested with pure unit tests, no database.
- e2e (Playwright) runs the real API on an in-memory PGlite (same migrations, `app_user`, RLS) seeded by the provisioning script, with a small fake Supabase Auth server (JWKS, password login, invite) replacing the hosted service. Both live under `apps/api/test/e2e` (issue #16; supersedes the earlier idea of PGlite server mode and an env-switched test issuer, which would have put a test-only switch in production code).
- Supabase projects are never used by automated tests.

## Consequences

- Isolation tests are cheap, so every repository has one.
- Any PostgreSQL feature unsupported by PGlite must be avoided or covered by a CI job against a real Postgres service container. None are expected in v1.
- Test suites stay fast enough to run on every PR.

## Alternatives considered

- Mocked repositories: do not test SQL or RLS. Rejected.
- Testcontainers: requires Docker on the developer machine. Kept as a fallback for CI if PGlite ever falls short.
- Shared remote test database: slow, flaky, shared state. Rejected.
