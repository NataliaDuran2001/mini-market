# ADR 0011: Hosting on Railway (API), Vercel or Cloudflare Pages (web) and Supabase

Status: Accepted, 2026-10-18

## Context

Two tenants at launch, one developer, minimal budget, need for preview deployments and simple rollbacks.

## Decision

- API: Railway service built from `apps/api`, environment variables per environment, migrations executed on deploy before the new version receives traffic.
- Web: static build of `apps/web` on Vercel or Cloudflare Pages with per-PR previews. The final choice is made in M0-6 based on the simplest CORS and env setup at that time.
- Database, Auth, Storage: Supabase (`mini-market-dev`, `mini-market-prod`).
- CI: GitHub Actions runs typecheck, lint, tests, build and migration check; deploys trigger from `main`.

## Consequences

- Monthly cost near zero in development; production on paid tiers only when PITR and no-pause guarantees are needed.
- Logs are split across Railway, the web host and Supabase; request ids tie them together.
- Moving the API to another Node host later is a configuration change.

## Alternatives considered

- Vercel serverless for the API: cold starts and connection limits with a NestJS app. Rejected.
- Fly.io or Render for the API: equivalent; Railway chosen for simplicity of env management.
- Self-hosted VPS: more control, more operations for one person.

## Amendment 2026-10-19

The owner deferred hosting until a stable v1 exists and asked to focus on the local environment first. Railway for the API and Vercel for the web were proposals, not commitments, and the choice is open again at go-live. Alternatives to evaluate then: Fly.io, Render, Google Cloud Run, or a VPS with Docker. The Docker image, migration job and workflows merged in PR #79 stay in the repo.
