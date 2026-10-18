# 05 - Security

Baseline for v1. The `architecture-reviewer` agent uses this file as a checklist on every issue.

## 1. Measures and the test that proves each

| Area | Measure | Proof |
|---|---|---|
| Tenant isolation | `TenantContext` required by every use case and repository method. RLS on every business table with `app.tenant_id` set per transaction by `withTransaction`. API connects as role `app_user`, which cannot bypass RLS. | One isolation test per repository: tenant A cannot read or write tenant B rows, even when the repository is called with the wrong id on purpose. Required in Definition of Done. |
| Authentication | Supabase Auth (email and password). API verifies JWT signature, issuer, audience and expiry against the project JWKS; keys cached and rotated. No public signup; users are created by the owner (invitation) or the operator. Supabase rate limits on auth endpoints. | Guard integration tests: expired, wrong issuer, tampered, missing token. e2e: protected route redirects. |
| Authorization | Permission matrix (`01-domain.md`) enforced in use cases. Owner-only data (cost, average cost, profit, capital, expenses, reports) never appears in employee DTOs. Tenant membership checked on every request via `X-Tenant-Id`. | Per use case: `employee` receives `ForbiddenError`. DTO tests assert absence of sensitive fields. Membership test: user of tenant A with header of tenant B gets 403. |
| Input validation | Zod schema from `@mm/contracts` on every endpoint. CSV import: max 5 MB, max 5,000 rows, MIME and extension check, parsed with papaparse, never evaluated. Drizzle parameterizes; raw SQL only in `reporting` through the `sql` tag with bound parameters. | Validation tests with invalid, oversized and malicious payloads (SQL fragments, script tags, formula injection `=CMD()` in CSV cells). |
| Secrets and config | `env` validated at startup with `@t3-oss/env-core`; process exits on missing or malformed values. Service role key exists only in the API environment. `.env*` ignored by git. No secrets in logs (pino redaction of `authorization`, `password`, `token`). | CI boots the API with a minimal env and fails on a missing variable. Log redaction unit test. |
| Transport and headers | HTTPS only in all environments. Helmet on the API: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, frameguard. CORS allows only the web origin per environment with credentials disabled (bearer token, not cookies). CSP on the web host. | e2e asserts headers on API and web responses. |
| Financial integrity | Append-only ledgers (`stock_movements`, `credit_ledger_entries`). Void by reverse entries. Database-level: no UPDATE or DELETE grants on ledger tables for `app_user`. Audit log for sensitive actions. | Tests: void does not delete; attempting UPDATE on a ledger as `app_user` fails; audit entry exists after each sensitive action. |
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
| `stock.adjusted` | product | quantity delta, reason |
| `product.price_changed` | presentation | old and new price |
| `product.cost_overridden` | product | old and new average cost (CSV import or manual) |
| `capital.recorded` | capital_movement | type, amount |
| `expense.deleted_or_cancelled` | expense | before |
| `membership.created`, `membership.removed`, `membership.role_changed` | membership | user, role |
| `tenant.settings_changed` | tenant | diff of settings |
| `tenant.provisioned` | tenant | preset, operator |
| `import.completed` | import | file name, rows ok, rows failed |

Entries store `tenant_id`, `user_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `created_at`. The table is append-only.

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
