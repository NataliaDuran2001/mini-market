# ADR 0008: UTC timestamps and tenant-timezone periods

Status: Accepted, 2026-10-18

## Context

Daily and monthly reports depend on where a sale falls on the calendar. Bolivia has no daylight saving (`America/La_Paz`, UTC-4), but the product should not assume that forever, and servers run in UTC.

## Decision

- All timestamps are `timestamptz` and stored in UTC.
- Each tenant has `timezone` in settings (`America/La_Paz` by default).
- `Period` in `@mini-market/shared-kernel` represents a calendar day or month in a given timezone and produces the UTC range `[start, end)` for queries.
- Expenses carry an explicit `period` column (`YYYY-MM`) chosen by the user, independent of timestamps (S5).
- Daily sales and monthly reports compute boundaries with `Period`, never with `date_trunc` in UTC.

## Consequences

- A sale at 23:30 La Paz time on October 31 lands in October, as the owner expects.
- Tests use `FixedClock` and timezone-aware assertions around month boundaries.
- Moving a tenant to another timezone changes future reports only; past data remains correct because it is UTC.

## Alternatives considered

- Local timestamps without timezone: ambiguous and wrong on servers in UTC.
- Single global timezone constant: works today, breaks with the first tenant abroad.
