# ADR 0001: Shared PostgreSQL with Row Level Security for multi-tenancy

Status: Accepted, 2026-10-18

## Context

The product serves several independent businesses (tenants). At launch there are two; the design should hold for tens of tenants without operational overhead. A data leak between tenants is the most damaging failure the product can have.

## Decision

- One PostgreSQL database shared by all tenants.
- Every business table carries `tenant_id uuid not null` with an index that starts with it.
- Row Level Security is enabled on every business table. Policies compare `tenant_id` with `current_setting('app.tenant_id', true)::uuid`.
- The API connects with a dedicated role `app_user` that does not own the tables and cannot bypass RLS. `withTransaction(ctx, fn)` runs `set_config('app.tenant_id', ctx.tenantId, true)` as the first statement of every transaction.
- Application code also scopes every query by `TenantContext`. RLS is the second line of defense, not the only one.
- Tenant equals organization. Users may belong to more than one tenant through memberships.

## Consequences

- One migration path, one backup, one connection pool.
- Every repository needs an isolation test (two tenants, no crossing). Tables without a policy fail the isolation suite.
- Cross-tenant reporting for the platform operator must use a privileged role outside the API, or a future `platform` module.
- A very large tenant can later be moved to its own database by changing the connection resolver; repositories already receive the tenant context.

## Alternatives considered

- Database per tenant: strongest isolation, but migrations, backups and connection management multiply per tenant. Unjustified for 2 to 20 tenants.
- Schema per tenant: same operational cost as database per tenant with weaker tooling support.
- Application-level filtering only: one forgotten `where` clause leaks data. Rejected.
