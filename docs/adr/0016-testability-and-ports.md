# ADR 0016: Testability through ports and injected dependencies

Status: Accepted, 2026-10-18

## Context

The requirement is that everything be testable and isolated. Hidden dependencies (global clients, static time, singletons) are what turns code into spaghetti and tests into integration-only suites.

## Decision

- Use cases declare their dependencies as a `deps` object of ports (interfaces): repositories, `Clock`, `IdGenerator`, `EventPublisher`, `ModulePolicy`. Nest providers wire real implementations; tests wire real repositories on PGlite and fakes for out-of-process IO.
- Domain code has no dependencies beyond `@mini-market/shared-kernel`.
- No module-level singletons except validated configuration. No access to the HTTP request inside modules; `TenantContext` is built once in presentation and passed down.
- Builders and `seedTenant` provide test data per module; no shared global fixtures.
- Coverage gates: 80% lines and branches on `domain` and `application`, 100% on `shared-kernel`, a pure-logic package (amended 2026-10-18 to match the implemented gate).
- Every acceptance criterion in an issue maps to a test marked `// AC-n`; `/verify-issue` enforces the mapping.

## Consequences

- Use cases can be exercised without booting Nest.
- Time-dependent rules (periods, same-day void) are deterministic in tests.
- Slightly more wiring code in Nest modules, generated from a template.

## Alternatives considered

- Service classes with constructor-injected Nest services and direct Drizzle access: faster to write, untestable without the container and the database wiring. Rejected.
- Mock-heavy unit tests for use cases: green tests with broken SQL. Rejected (see ADR 0010).
