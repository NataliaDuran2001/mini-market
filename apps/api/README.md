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

Merge conflicts in those two files: keep both sides, sorted. Migrations are named with a timestamp prefix (`drizzle.config.ts`), so two branches that add a migration do not collide: keep both.

Boundaries are enforced by lint (`packages/config/eslint/boundaries.mjs`). Controllers import `src/infrastructure/http` only; use cases receive their dependencies as ports and are provided in `<domain>.module.ts`.

## Tests

- `src/**/*.test.ts`: unit tests next to the code.
- `test/harness.ts`: `createTestDb()` starts PGlite and applies every migration from `drizzle/`; call `truncateAll()` in `beforeEach`. One database per test file.
- `test/create-test-app.ts`: boots the app exactly like `main.ts` on that database, for supertest.
