# ADR 0013: Result type for expected errors

Status: Accepted, 2026-10-18

## Context

Business failures (insufficient stock, customer over credit limit, employee not allowed) are normal outcomes, not exceptions. Hidden control flow through thrown errors makes use cases hard to read and test.

## Decision

- `Result<T, E>` lives in `@mm/shared-kernel` with `ok(value)`, `err(error)`, `isOk`, `isErr`, `map`, `andThen`, `unwrapOr`.
- Use cases return `Promise<Result<Output, DomainError>>`. Domain functions return `Result` when they can fail for business reasons.
- `DomainError` is an abstract class with a stable `code` (`INSUFFICIENT_STOCK`), an HTTP status hint and optional `details`. Concrete errors extend it.
- Exceptions are reserved for bugs and infrastructure failures (lost connection, invariant violation). A global Nest filter maps unexpected exceptions to 500 with a request id and no internals.
- A second global filter maps `DomainError` returned by controllers to the HTTP status and a JSON body `{ code, message, details }`. The web translates `code`.

## Consequences

- Failure paths are visible in types and must be handled by callers.
- Tests assert on `result.error.code`, not on thrown messages.
- Slightly more verbose call sites, offset by `andThen` chaining.

## Alternatives considered

- Throwing typed exceptions: familiar in Nest, but invisible in signatures. Rejected.
- Returning `null` or booleans: loses the reason. Rejected.
