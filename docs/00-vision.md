# 00 - Vision

## What this product is

A multi-tenant web SaaS for small buy-and-sell businesses. One codebase, one deployment, one database. Each business (tenant) gets its own isolated data and a configuration that switches modules on or off depending on its vertical.

## Who it is for

| Priority | Business | Why it matters |
|---|---|---|
| 1 | A minimarket in Bolivia (paying client) | Defines the v1 scope and the delivery deadline |
| 2 | A pharmacy in Bolivia (founder's family) | Validates the module system: lots, expiry dates, fractional sales |
| 3 | Any other business that buys and sells goods | Served by vertical presets (`minimarket`, `farmacia`, `generic`) plus per-tenant modules |

Users inside a tenant are the owner and one or more employees with limited permissions. One branch per tenant.

## v1 deliverables (as requested by the client)

| # | Deliverable | Milestone |
|---|---|---|
| 1 | Product inventory with current stock | M2 |
| 2 | Purchases that update stock and cost | M3 |
| 3 | Daily sales recording and daily sales view | M4 |
| 4 | Fixed monthly expenses and accounts payable | M5 |
| 5 | Initial capital and later contributions or withdrawals | M6 |
| 6 | Monthly report with gross profit (what was actually earned on what was sold) and net profit | M7 |

Additions agreed with the founder for v1: owner and employee roles, CSV import from the client's Excel, tenant modules from day one, credit sales ("fiado") as the last milestone and the first thing to cut if the deadline slips.

## Operating assumptions

| Topic | Decision |
|---|---|
| Country and currency | Bolivia, BOB (Bs). Prices are final; VAT is not modeled (see S10). |
| Platform | Responsive web app, always online. Works on phone and PC. |
| Sales entry | Manual product search by name or code. No barcode scanner in v1. |
| Receipts | Internal non-fiscal receipt only. |
| Tenant onboarding | Manual, by the platform operator, through a provisioning script and the Supabase dashboard. |
| Language | UI in Spanish. Code, documentation, issues and commits in English. |

## Non-goals (explicitly out of scope for v1)

| Non-goal | Reason |
|---|---|
| Fiscal invoicing (SIN) | Regulatory integration with certificates and homologation. Prices are stored as final amounts so it can be added later as an `invoicing` module. |
| Offline mode / PWA sync | High complexity; the client has stable connectivity. |
| Native mobile app | Responsive web covers the use case. |
| Barcode scanner | Added later as a search input; no architectural impact. |
| Multiple branches per tenant | Adds a dimension to every table. Not needed by either business. |
| Prescriptions and controlled substances registry | Pharmacy regulation (AGEMED) scope, v2 or later. |
| Insurers and third-party payers | High complexity, no demand yet. |
| Subscription billing and public signup | Two tenants at launch, both provisioned manually. |

## v2 outlook

| Epic | Enables |
|---|---|
| Lots and expiry dates (`lots` module) | Pharmacy and perishables; FEFO stock exit, expiry alerts |
| Fractional sales (`fractional` module) | Buy a box of 100, sell by unit or blister |
| Pharmacy tenant onboarding | First real pharmacy user |
| Custom product fields (`custom_fields` module) | Active ingredient, laboratory, brand |
| Tenant branding | Name, logo and color on screen and receipts |
| Platform admin panel | Replaces the provisioning script and dashboard usage |

## Success criteria for v1

- The minimarket records every sale, purchase and expense in the system for one full month.
- The monthly report's gross and net profit match a manual reconciliation done by the owner.
- An employee can sell without seeing costs, profit, capital or expenses.
- Data from one tenant is never visible to another (proved by automated tests at every milestone).
