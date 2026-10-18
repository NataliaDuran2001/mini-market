# ADR 0006: Tenant modules and vertical presets

Status: Accepted, 2026-10-18

## Context

The same codebase must serve a minimarket today, a pharmacy next, and other buy-and-sell businesses later. Pharmacy needs lots, expiry dates and fractional sales that a minimarket does not. Forking per vertical duplicates code.

## Decision

- `tenants.settings` is a JSONB document validated by a Zod schema: `vertical`, `modules { lots, fractional, credit_sales, custom_fields }`, `allowNegativeStock`, `employeeCanVoid`, `timezone`, `currency`.
- Presets (`minimarket`, `farmacia`, `generic`) seed the settings and the catalogs at provisioning time. After that, flags are editable per tenant.
- A `ModulePolicy` service answers `isEnabled(ctx, module)`. Use cases consult it to validate input (a sale with multiple presentations requires `fractional`); the web consults the settings snapshot to show or hide navigation and fields.
- The database schema always contains the columns and tables for every module. Disabling a module hides behavior, it does not change the schema.
- Adding a vertical means adding a preset. Adding a capability means adding a module flag and the code that reads it.

## Consequences

- Minimarket and pharmacy run the same migrations and the same API.
- Tests run each use case with the relevant flag on and off.
- Settings changes are audited (`tenant.settings_changed`).

## Alternatives considered

- Separate codebases or branches per vertical: duplication and divergence.
- Per-tenant plugins loaded at runtime: unnecessary complexity for a handful of flags.
