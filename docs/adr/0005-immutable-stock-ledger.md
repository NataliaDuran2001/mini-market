# ADR 0005: Immutable stock ledger

Status: Accepted, 2026-10-18

## Context

Stock must be auditable: the owner needs to know why a quantity changed. Voids, adjustments and imports must leave a trail. A mutable `stock` column loses history and makes bugs undetectable.

## Decision

- `stock_movements` is an append-only table: `tenant_id, product_id, type, quantity (signed, base units), unit_cost, reference_type, reference_id, reason, created_by, created_at`.
- Movement types in v1: `initial`, `purchase`, `sale`, `adjustment`, `void`. Reserved for v2: `expired`.
- `stock_levels` holds the current quantity per product and is updated in the same transaction as the movement. A verification query (`sum(movements) = stock_level`) runs in tests and can run as a maintenance job.
- Role `app_user` has no UPDATE or DELETE grant on `stock_movements`.
- Average cost lives on the product and is recalculated on `purchase` and `initial` movements (S3).

## Consequences

- Every stock change has an author, a reason and a reference.
- Voiding a sale writes reverse movements (S12); nothing is edited.
- Reports can reconstruct stock at any date from the ledger.
- Lot tracking in v2 adds `lot_id` to movements without changing the pattern.

## Alternatives considered

- Mutable `products.stock` column: simplest, no history. Rejected.
- Event sourcing for the whole domain: more than this product needs; the ledger gives the benefits where they matter.
