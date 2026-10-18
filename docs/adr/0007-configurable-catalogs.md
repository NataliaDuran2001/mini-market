# ADR 0007: Configurable catalogs per tenant

Status: Accepted, 2026-10-18

## Context

Categories, units, payment methods and expense categories differ between a minimarket and a pharmacy, and owners want to add their own.

## Decision

- Catalog tables per tenant: `categories`, `units`, `payment_methods`, `expense_categories`. Each row has `tenant_id, name, is_active, sort_order`.
- `payment_methods.kind` is a fixed enum (`cash`, `qr`, `card`, `transfer`, `credit`) so reports and the credit flow can reason about behavior while names stay free.
- Presets seed the initial rows. Owners edit names, order and activation; rows referenced by transactions are deactivated, never deleted.
- `units` carry a `kind` (`count`, `weight`, `volume`) and a `precision` used by `Quantity` input.

## Consequences

- Owners customize vocabulary without developer involvement.
- Reports group by catalog id and show the current name.
- Catalog CRUD is one generic use case family in `catalog`, reused for all four tables.

## Alternatives considered

- Hardcoded enums: no customization. Rejected.
- Free text on each transaction: no grouping or validation. Rejected.
