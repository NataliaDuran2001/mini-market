# ADR 0014: Cross-module orchestration in one transaction plus post-commit events

Status: Accepted, 2026-10-18

## Context

Confirming a sale touches `sales`, `inventory` and (for credit) `receivables`. The write must be atomic. Side effects like low-stock alerts and audit entries should not couple modules further. A single developer needs flows that are easy to debug.

## Decision

- Atomic flows are orchestrated explicitly by the owning use case: `confirmSale` calls `inventory.recordMovements(tx, ...)` and `receivables.registerCreditSale(tx, ...)` through their public APIs, all inside one `withTransaction`. The transaction handle is passed explicitly.
- Modules publish domain events (`SaleConfirmed`, `StockBelowMinimum`, `PurchaseRegistered`) to an in-process bus. Events are buffered during the transaction and dispatched after commit.
- Handlers are idempotent and failure-isolated: a failing handler logs and does not affect the committed write.
- No external queue, no saga, no event sourcing in v1. If reliability of side effects becomes a requirement, an outbox table is the next step.

## Consequences

- Reading `confirmSale` shows the whole business flow in one place.
- New reactions (future `invoicing`, notifications) subscribe to events without touching `sales`.
- Event handlers run in the API process; long tasks must stay short or be deferred.

## Alternatives considered

- Events for everything, including the atomic writes: debugging across handlers for one person is slow. Rejected.
- Database triggers for cross-module writes: logic hidden in SQL. Rejected.
