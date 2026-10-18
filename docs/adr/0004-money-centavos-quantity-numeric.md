# ADR 0004: Money as integer centavos, quantities as numeric(14,3)

Status: Accepted, 2026-10-18

## Context

Profit figures must match the owner's manual reconciliation to the centavo. JavaScript `number` arithmetic on decimals produces rounding drift. Pharmacy sales in v2 require fractional quantities (half a blister, by unit of a box).

## Decision

- Money is stored as `bigint` centavos in PostgreSQL and handled through the `Money` value object from `@mini-market/shared-kernel`. No column stores decimal money.
- `Money` exposes `add`, `subtract`, `multiplyByQuantity`, `allocate` (for splitting without losing centavos) and `compare`. Rounding is half-up to the centavo and happens only inside `Money`.
- Quantities are stored as `numeric(14,3)` and handled through `Quantity` with three decimals.
- Currency is fixed per tenant (`BOB` in v1) and carried on `Money` for assertions, not for conversion.
- API contracts transport money as integer centavos; the web formats through `formatMoney`.

## Consequences

- Sums over thousands of rows stay exact.
- Developers cannot do `price * qty` on raw numbers; lint and review enforce the value objects.
- Weighted average cost (S3) is computed with integer arithmetic and rounded once per recalculation.

## Alternatives considered

- `numeric(12,2)` for money: exact in the database but turns into floating point in JavaScript unless wrapped anyway.
- Floating point: rejected.
- A decimal library (decimal.js): heavier than needed when all amounts are centavos.
