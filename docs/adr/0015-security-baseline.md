# ADR 0015: Security baseline

Status: Accepted, 2026-10-18

## Context

The system stores financial data of several businesses and is operated by non-technical users. The two risks that matter most are cross-tenant exposure and employees seeing owner-only figures.

## Decision

Adopt the baseline in `05-security.md` as mandatory from M1:

- Defense in depth for tenancy: `TenantContext` in code plus RLS in the database (ADR 0001).
- Supabase Auth with JWT verification in the API; invitation-only accounts.
- Permissions enforced in use cases; employee DTOs shaped to exclude cost, profit and capital.
- Zod validation on every input; CSV limits and sanitization.
- Validated environment; service role key only in the API; log redaction.
- Helmet and strict CORS; HTTPS everywhere.
- Append-only ledgers, void by reversal, audit log for sensitive actions, no physical delete of financial rows.
- Dependency hygiene with Renovate and audit in CI.
- Each measure has a named automated test; the `architecture-reviewer` checks the list on every issue.

## Consequences

- Isolation and permission tests are part of the Definition of Done for every issue with persistence.
- Some convenience is traded away (no public signup, no cookies-based session).
- The checklist grows with new modules; `05-security.md` is updated in the same PR.

## Alternatives considered

- Security review at the end of v1: findings would require rework of every module. Rejected.
