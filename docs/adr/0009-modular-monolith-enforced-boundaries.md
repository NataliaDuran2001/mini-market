# ADR 0009: Modular monolith by domain with enforced boundaries

Status: Accepted, 2026-10-18

## Context

The requirement is clean, scalable code organized by domain, testable in isolation, with no spaghetti dependencies. The team is one developer; microservices would multiply operational cost without benefit.

## Decision

- One API deployable composed of domain modules: `tenancy`, `access`, `audit`, `catalog`, `inventory`, `purchasing`, `sales`, `payables`, `equity`, `reporting`, `receivables`.
- Each module has four layers: `domain` (pure), `application` (use cases and ports), `infrastructure` (Drizzle schema and repositories), `presentation` (Nest controllers). `index.ts` is the only public surface.
- Dependencies between modules form a directed acyclic graph documented in `02-architecture.md`. Modules talk only through public use cases and exported types.
- `eslint-plugin-boundaries` encodes the layer and module rules. A forbidden import fails lint and CI.
- The web mirrors this with `features/<domain>` exposing `index.ts`.
- Shared primitives live in `@mini-market/shared-kernel`; API shapes live in `@mini-market/contracts`. Neither depends on the apps.

## Consequences

- A new feature is a new module with the same template; onboarding and review are predictable.
- Modules can be extracted to a service later because no one imports their internals.
- Some duplication between modules is accepted over coupling (for example, each module has its own repository for its own tables).
- `reporting` is a documented exception allowed to read other modules' exported schemas.

## Alternatives considered

- Global layers (`controllers/`, `services/`, `models/`): coupling grows with every feature. Rejected.
- Microservices: premature. Rejected.
- Full hexagonal with five or more layers per module: more ceremony than value at this size.

## Amendments

- 2026-10-18: added the edge `payables -> catalog` (expenses reference expense categories and payment methods; catalog depends only on tenancy, so the graph stays acyclic). `purchasing -> catalog` follows with the purchases issue.
