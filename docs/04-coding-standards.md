# 04 - Coding Standards

These rules apply to every pull request. CI enforces the ones marked "lint" or "CI"; reviewers enforce the rest with the checklist at the end.

## 1. TypeScript

| Rule | Enforcement |
|---|---|
| `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` | tsconfig in `@mini-market/config` |
| No `any`. `unknown` plus narrowing instead. | lint (`no-explicit-any`) |
| Type assertions (`as`) only with a one-line comment explaining why the compiler cannot know. | review |
| No non-null assertions (`!`). | lint |
| Prefer `readonly` arrays and properties in domain types. | review |
| No default exports except where a framework requires them (route files). | lint |

## 2. Ubiquitous language

- Identifiers come from the glossary in `01-domain.md`. If a concept is missing, add it to the glossary in the same PR.
- Spanish appears only in i18n message files and test fixtures that mimic user input.
- Business rules are referenced by number in code comments and tests: `// S3: weighted average`.

## 3. Domain and application layers

| Rule | Detail |
|---|---|
| One use case per file | `confirm-sale.ts` exports `confirmSale(deps, ctx, input)`. Verb-noun names. |
| Explicit `TenantContext` | Every use case and repository method takes `ctx: TenantContext` as a parameter. Never read tenant or user from globals, async storage or the request object inside modules. |
| Permissions in use cases | First line of a use case is the permission check. UI checks are convenience only. |
| `Result` for expected errors | Use cases return `Result<T, DomainError>`. Throw only for bugs and infrastructure failures. |
| Typed domain errors | `class InsufficientStockError extends DomainError` with a stable `code` used by the web for translation. |
| Value objects for money and quantity | `Money` (integer centavos) and `Quantity` (3 decimals) from `@mini-market/shared-kernel`. Arithmetic with raw `number` on money is a review blocker. |
| Immutability | Domain objects are `readonly`. Functions return new values. No mutation of inputs. |
| Repository per aggregate | `SaleRepository`, `ProductRepository`. Ports are interfaces in `application/ports/`. Implementations live in `infrastructure/`. |
| No ORM in use cases | Use cases talk to ports only. Exception: `reporting` queries. |
| Time via `Clock` | `clock.now()` from deps. `new Date()` only inside infrastructure. |
| Ledgers are append-only | Never `UPDATE` or `DELETE` on `stock_movements`, `credit_ledger_entries`, `audit_log`. |

## 4. Presentation layer (API) and pages (web)

- Controllers and route components contain at most 15 lines of logic: parse input, build context, call one use case or hook, map the result.
- Controllers never import Drizzle, repositories or other modules' internals.
- HTTP mapping of `DomainError` codes is centralized in one filter, not repeated per controller.

## 5. Size guidelines (review, not gates)

| Unit | Guideline |
|---|---|
| Function | 40 lines |
| File | 300 lines |
| Nesting | 3 levels |
| Parameters | 3; use an options object beyond that |

## 6. Naming

| Thing | Convention | Example |
|---|---|---|
| Files and folders | kebab-case | `confirm-sale.ts`, `stock-movement.repository.ts` |
| Types, classes | PascalCase | `SaleLine`, `InsufficientStockError` |
| Functions, variables | camelCase | `confirmSale`, `averageCost` |
| Constants | UPPER_SNAKE only for true constants | `MAX_CSV_ROWS` |
| Tables | snake_case, plural | `stock_movements`, `sale_lines` |
| Columns | snake_case | `unit_cost`, `tenant_id`, `created_at` |
| Money columns | `bigint`, suffix none, documented as centavos | `total`, `unit_cost` |
| Quantity columns | `numeric(14,3)` | `quantity`, `base_quantity` |
| Enums | text with check constraint or Postgres enum, snake_case values | `payment_type in ('cash','credit')` |
| REST paths | `/api/v1/<plural-resource>` kebab-case, tenant from header `X-Tenant-Id` | `POST /api/v1/sales`, `POST /api/v1/sales/:id/void` |
| Query hooks (web) | `use<Resource><Action>` | `useSalesOfDay`, `useConfirmSale` |
| Events | PascalCase past tense | `SaleConfirmed`, `StockBelowMinimum` |
| i18n keys | dotted by feature | `sales.confirm.success` |
| Branches | `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<slug>` | `feat/42-confirm-sale` |
| Commits | Conventional Commits, English, imperative | `feat(sales): confirm sale with cost snapshot (#42)` |

## 7. React feature conventions

- A feature exposes pages and shared components through `index.ts` only.
- Data access lives in `features/<x>/api/` as TanStack Query hooks typed with `@mini-market/contracts`. Components never call `fetch`.
- Forms use react-hook-form with the Zod schema from `@mini-market/contracts`, so client validation equals server validation.
- Role-aware rendering uses a `useCan(permission)` hook backed by the permissions in the session; it hides UI, it does not authorize.
- Money is rendered through `formatMoney(money, locale)` from `src/lib`; never format centavos by hand.
- Components receive data and callbacks; containers (pages) wire hooks. Keep business decisions out of JSX.
- Phone first: every screen is designed at 390px width before desktop.

## 8. Database and migrations

- One migration per PR when schema changes; never edit an applied migration.
- Every business table has `tenant_id uuid not null`, an index starting with `tenant_id`, and an RLS policy. The isolation test suite fails for any table missing a policy.
- `created_at timestamptz default now()`; `created_by uuid` on user-originated rows.
- Soft delete (`is_active`) for catalogs; no physical delete on financial rows.

## 9. Tests

See `06-testing-strategy.md`. Minimum per PR: unit tests for new domain rules, an integration test per new use case including the failure paths and the tenant isolation case, and e2e coverage when the PR closes a milestone deliverable.

## 10. Pull request checklist

- [ ] Issue linked with `Closes #N`; every acceptance criterion maps to a test (`// AC-n`) or documented manual evidence.
- [ ] No lint, typecheck or boundary errors.
- [ ] Use cases take `TenantContext` and check permissions first.
- [ ] Money and quantities use `Money` and `Quantity`.
- [ ] Expected errors return `Result`; no control flow by exceptions.
- [ ] New tables have `tenant_id`, index and RLS policy; isolation test added.
- [ ] No logic in controllers or pages beyond the 15-line rule.
- [ ] Ledger tables untouched by UPDATE or DELETE.
- [ ] Sensitive actions write to the audit log.
- [ ] Employee DTOs exclude cost, profit and capital fields.
- [ ] UI strings in i18n files, Spanish, no hardcoded text.
- [ ] Migration reversible and not edited after being applied.
- [ ] Docs updated when the glossary, an ADR or the roadmap is affected.
