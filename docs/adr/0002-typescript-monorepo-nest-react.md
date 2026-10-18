# ADR 0002: TypeScript monorepo with a NestJS API and a React web app

Status: Accepted, 2026-10-18

## Context

One developer builds and maintains the product with Claude Code as executor. The backend and frontend must live in the same repository in separate folders. The developer has prior experience with NestJS and TypeScript.

## Decision

- Single repository managed with pnpm workspaces and Turborepo.
- `apps/api`: NestJS 11 with Drizzle ORM. Domain modules under `src/modules`.
- `apps/web`: React 19 with Vite 6, TanStack Router and TanStack Query, shadcn/ui and Tailwind 4, i18next.
- `packages/shared-kernel`: pure TypeScript value objects and result types used by both apps.
- `packages/contracts`: Zod schemas and types that define the API contract.
- `packages/config`: shared tsconfig, ESLint and Prettier presets.
- One language across the stack: TypeScript 5 in strict mode.

## Consequences

- One toolchain, one lint config, one test runner (Vitest) plus Playwright.
- Types flow from database schema (Drizzle) to API (contracts) to web without duplication.
- Turborepo caches builds and tests per package; CI runs only what changed.
- The frontend is a static bundle; no SSR. Acceptable because every screen sits behind login.

## Alternatives considered

- Next.js full stack: fewer moving parts but mixes backend and frontend in one app, against the requirement of separate folders and a dedicated API.
- Python backend: a second language and ecosystem for a single developer.
- Angular frontend: viable, but React plus shadcn/ui has the richer component ecosystem for the screens needed (sale screen, tables, forms) and matches the developer's recent work.
