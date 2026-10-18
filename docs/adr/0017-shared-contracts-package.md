# ADR 0017: Shared contracts package as the single API contract

Status: Accepted, 2026-10-18

## Context

API and web live in the same repository but are separate apps. Duplicated request and response types drift. Generated clients from OpenAPI add a build step and lag behind changes.

## Decision

- `packages/contracts` (`@mm/contracts`) holds one Zod schema per request body, query and response, grouped by module (`contracts/sales/confirm-sale.ts`). Types are inferred from schemas.
- The API parses inputs with these schemas (through `nestjs-zod`) and types controller outputs with the response types. A contract test per endpoint validates real responses against the response schema.
- The web types TanStack Query hooks, forms (react-hook-form resolvers) and MSW handlers with the same schemas.
- OpenAPI is generated from Nest decorators for documentation and external tooling. It is not the source of truth.
- Money travels as integer centavos; dates as ISO strings; ids as strings. Contracts never import from `apps/*`.

## Consequences

- A contract change is one edit that breaks the compiler on both sides until both are updated.
- Client and server validation are identical by construction.
- Contracts must stay free of server-only concerns (no Drizzle types).

## Alternatives considered

- Generated client from OpenAPI (orval, openapi-typescript): extra step, drift between generation runs. Rejected.
- tRPC: couples the web to Nest internals and bypasses REST conventions needed for future integrations. Rejected.
- Hand-written types on each side: drift. Rejected.
