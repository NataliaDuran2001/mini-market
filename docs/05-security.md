# 05 - Security

Baseline for v1. The `architecture-reviewer` agent uses this file as a checklist on every issue.

## 1. Measures and the test that proves each

| Area | Measure | Proof |
|---|---|---|
| Tenant isolation | `TenantContext` required by every use case and repository method. RLS on every business table with `app.tenant_id` set per transaction by `withTransaction`. API connects as role `app_user`, which cannot bypass RLS. | One isolation test per repository: tenant A cannot read or write tenant B rows, even when the repository is called with the wrong id on purpose. Required in Definition of Done. |
| Authentication | Supabase Auth (email and password). API verifies JWT signature, issuer, audience and expiry against the project JWKS; keys cached and rotated. No public signup; users are created by the owner (invitation) or the operator. Supabase rate limits on auth endpoints. | Guard integration tests: expired, wrong issuer, tampered, missing token. e2e: protected route redirects. |
| Authorization | Permission matrix (`01-domain.md`) enforced in use cases. Owner-only data (cost, average cost, profit, capital, expenses, reports) never appears in employee DTOs. Tenant membership checked on every request via `X-Tenant-Id`. | Per use case: `employee` receives `ForbiddenError`. DTO tests assert absence of sensitive fields. Membership test: user of tenant A with header of tenant B gets 403. |
| Input validation | Zod schema from `@mini-market/contracts` on every endpoint. CSV import: max 5 MB, max 5,000 rows, MIME and extension check, parsed with papaparse, never evaluated. Drizzle parameterizes; raw SQL only in `reporting` through the `sql` tag with bound parameters. | Validation tests with invalid, oversized and malicious payloads (SQL fragments, script tags, formula injection `=CMD()` in CSV cells). |
| Secrets and config | `env` validated at startup with `@t3-oss/env-core`; process exits on missing or malformed values. Service role key exists only in the API environment. `.env*` ignored by git. No secrets in logs (pino redaction of `authorization`, `password`, `token`). | CI boots the API with a minimal env and fails on a missing variable. Log redaction unit test. |
| Transport and headers | HTTPS only in all environments. Helmet on the API: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frameguard. CORS allows only the web origin per environment with credentials disabled (bearer token, not cookies). CSP on the web host. | e2e asserts headers on API and web responses. |
| Financial integrity | Append-only ledgers (`stock_movements`, `credit_ledger`). Void by reverse entries. Database-level: no UPDATE or DELETE grants on ledger tables for `app_user`. Audit log for sensitive actions. | Tests: void does not delete; attempting UPDATE on a ledger as `app_user` fails; audit entry exists after each sensitive action. |
| Data protection and backup | Supabase daily backups and PITR on the prod plan. Migrations reversible. No physical delete of financial rows. Minimal personal data (customer name, phone). | Migration review per PR. |
| Dependencies | Lockfile committed. Renovate weekly. `pnpm audit --prod --audit-level high` in CI. | CI. |
| Operator access | Supabase dashboard access limited to the operator account with 2FA. Provisioning script logs to the audit table. | Manual review. |

## 2. OWASP Top 10 mapped to this project

| OWASP | Risk here | Control |
|---|---|---|
| A01 Broken access control | Cross-tenant reads, employee seeing profit | TenantContext + RLS, use case permission checks, DTO shaping, membership check per request |
| A02 Cryptographic failures | Token or secret leakage | HTTPS, JWT verification, secrets only in env, log redaction |
| A03 Injection | SQL via search or reports, CSV formula injection | Drizzle parameters, bound raw SQL, Zod, CSV cell sanitization on export (prefix `'` for cells starting with `=`, `+`, `-`, `@`) |
| A04 Insecure design | Mutable ledgers, deletable sales | Append-only ledgers, void by reversal, audit log |
| A05 Security misconfiguration | Open CORS, missing headers, debug in prod | Helmet, strict CORS, env validation, no Swagger UI in prod |
| A06 Vulnerable components | Outdated packages | Renovate, audit in CI, pinned versions |
| A07 Identification and authentication failures | Weak sessions | Supabase Auth, short-lived access tokens, refresh handled by supabase-js, invitation-only accounts |
| A08 Software and data integrity failures | Unreviewed changes to main | Protected `main`, PR required, CI required |
| A09 Logging and monitoring failures | No trace of who voided a sale | Structured logs with request id, audit log, Railway and Supabase logs retained |
| A10 SSRF | None in v1 (no outbound fetch from user input) | Not applicable; revisit if webhooks are added |

## 3. Audit log events

| Action | Entity | Payload |
|---|---|---|
| `sale.voided` | sale | before status, reason, lines |
| `inventory.adjusted` | product | before and after quantity, delta, reason (name fixed by issue #20; it replaces `stock.adjusted`) |
| `product.price_changed` | presentation | old and new price |
| `product.cost_overridden` | product | old and new average cost (CSV import or manual) |
| `capital.recorded` | capital_movement | type, amount |
| `collection.recorded` | customer | ledger entry id, amount, method |
| `customer.credit_limit_changed` | customer | old and new credit limit |
| `expense.deleted_or_cancelled` | expense | before |
| `member.joined`, `member.disabled`, `member.role_changed` | membership | before and after: role, status (names fixed by issue #11; they replace `membership.created`, `membership.removed` and `membership.role_changed`) |
| `tenant.settings_changed` | tenant | diff of settings |
| `tenant.provisioned` | tenant | preset, operator |
| `import.completed` | import | file name, rows ok, rows failed |

Entries store `tenant_id`, `actor_user_id` (null for the operator), `action`, `entity`, `entity_id`, `before`, `after`, `at`. The table is append-only.

## 4. CORS and Helmet intent

- CORS: `origin` equals the exact web origin for the environment (`http://localhost:5173` in dev), methods `GET,POST,PUT,PATCH,DELETE`, headers `Authorization, Content-Type, X-Tenant-Id`, `credentials: false`.
- Helmet defaults plus `hsts` with one year and `includeSubDomains` in prod. `contentSecurityPolicy` disabled on the API (JSON only) and configured on the web host.
- Swagger UI served only when `NODE_ENV !== 'production'`.

## 5. Secrets inventory

| Secret | Lives in | Never in |
|---|---|---|
| Supabase service role key | API env (Railway) | web bundle, repo, logs |
| Supabase anon key | web env, API env | repo (use env), it is public by design but still not committed |
| Database connection string (pooler, role `app_user`) | API env | web, repo |
| Supabase JWT issuer and JWKS URL | API env | n/a (public) |
| Railway, Vercel tokens | GitHub Actions secrets | repo |

## 6. Identity and invitations (issue #9)

| Topic | Rule | Proof |
|---|---|---|
| Access tokens | `SupabaseJwtGuard` accepts only RS256 or ES256 tokens whose signature, issuer (`SUPABASE_JWT_ISSUER`), audience `authenticated` and expiry check out against the cached JWKS. A failure answers `401 UNAUTHENTICATED` with one fixed body and logs a reason code, never the token. A missing token is logged at info, a rejected one at warn. | `auth-guard.test.ts`, `jwks.test.ts` (rotation, RS256, HMAC key confusion) |
| Outage is not a bad token | When the JWKS cannot be fetched the answer is `503 IDENTITY_PROVIDER_UNAVAILABLE`, so the web does not sign everybody out. | `access-defaults.test.ts` |
| URLs | `SUPABASE_URL`, `SUPABASE_JWT_ISSUER` and `WEB_ORIGIN` must be https, except for localhost. | `env.test.ts` |
| Invitation token | 256 random bits in the link, only its SHA-256 stored, valid 7 days, replaced when the owner resends. The `invitations` table has `tenant_id` but no RLS: the invitee has no membership yet when the token is looked up, so access stays inside the `access` repository (issue #12 lists it as an exception). | `invite-member.test.ts` |
| No account enumeration | The invitation response and errors never say whether an email already has an account. | `invitations.test.ts`, `supabase-admin.client.test.ts` |
| Public signup | Must be off on every Supabase project (`disable_signup`). Manual check, record the date when done. | Manual |
| Tenant resolution | Every route is tenant scoped unless it is `@Public()` or `@WithoutTenant()`. The tenant guard reads `X-Tenant-Id` (400 when missing or not a UUID), requires an active membership (403 `NOT_A_MEMBER`, the same answer for an unknown tenant, a stranger and a disabled member) and builds the `TenantContext` with the settings snapshot of that request. Nothing is cached between requests, so disabling a member or flipping a setting applies on the next call. | `tenant-guard.test.ts`, `tenancy-http.test.ts` |
| Permissions | Declared per module, checked by `@RequirePermission` and again in the use case with `ctx.can`. An unknown permission is denied to everybody. The 403 names the permission (`details.permission` and `permission`). A test iterates the registry and fails if an employee can hold a permission on cost, profit, capital, expenses or reports. | `tenant-guard.test.ts`, `permission-registry.test.ts` |
| Members | Only an owner lists, re-roles or disables members. A member is never deleted, the tenant always keeps one active owner (409 `LAST_OWNER`), and an id from another tenant answers 404. Each change writes `member.role_changed` or `member.disabled` to the audit log inside the same transaction. Member changes of one tenant take an advisory lock first, so two owners editing each other queue instead of deadlocking; PGlite has one connection, so no test exercises that race. | `members.test.ts` |
| Accepting an invitation | The token is looked up by hash with the row locked: a second use answers 409, an expired one 410, and a token presented by a different email answers 404 like an unknown one, before any check of used or expired, and the email claim of the access token is trusted because public signup is off. Accepting never demotes an existing owner. | `accept-invitation.test.ts` |
| Audit log | Append-only: a row trigger rejects UPDATE and DELETE (issue #12 also revokes UPDATE, DELETE and TRUNCATE from `app_user`). | `members.test.ts` |
| Row level security (#12) | Tenant tables (`memberships`, `audit_log`, `tenants` by id) have RLS enabled and forced, with a policy on `app.tenant_id`. `memberships` and `tenants` also let a user read their own rows before a tenant is bound (the picker). `users` and `invitations` have no tenant policy. `app_user` cannot bypass RLS, has no UPDATE, DELETE or TRUNCATE on the audit log, and cannot create tenants (provisioning uses the owner role). Without a binding a tenant table answers zero rows. New tables use `tenantTable()` and `app.enable_tenant_rls`. | `rls.test.ts`, `expectTenantIsolation` per repository |
