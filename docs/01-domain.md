# 01 - Domain

This document is the single source of truth for business vocabulary and business rules. Code uses the English terms. The UI shows the Spanish terms. Issues and tests cite rules by number (S1 to S13).

## 1. Glossary (EN code term to ES business term)

| EN (code, tables, API) | ES (UI, client conversations) | Notes |
|---|---|---|
| tenant | negocio | One business. Owns all its data. |
| vertical | rubro | `minimarket`, `farmacia`, `generic`. Selects a preset. |
| module | módulo | A feature switch per tenant. |
| owner | dueño | Full access inside the tenant. |
| employee | empleado | Limited access. |
| membership | membresía | Link between a user and a tenant with a role. |
| product | producto | |
| presentation | presentación | Sellable unit of a product with a factor to the base unit. |
| base unit | unidad base | Unit in which stock is counted. |
| category | categoría | |
| unit | unidad | Catalog of measurement units. |
| stock movement | movimiento de stock | Immutable ledger entry. |
| stock level | stock actual | Derived from the ledger. |
| adjustment | ajuste | Manual stock correction with reason. |
| minimum stock | stock mínimo | Threshold for the low-stock alert. |
| supplier | proveedor | |
| purchase | compra | |
| purchase line | línea de compra | |
| weighted average cost | costo promedio ponderado | Current unit cost of a product. |
| COGS (cost of goods sold) | costo de lo vendido | |
| sale | venta | |
| sale line | línea de venta | |
| receipt | comprobante | Internal, non-fiscal. |
| void | anulación | Reverses a sale, never deletes it. |
| payment method | método de pago | Catalog: cash, QR, card, transfer, credit. |
| expense | gasto | |
| recurring expense | gasto fijo | Monthly template that generates expenses. |
| expense category | categoría de gasto | |
| payable | cuenta por pagar | Unpaid expense or unpaid credit purchase. |
| payment | pago | Money out against a payable. |
| receivable / credit sale | fiado / cuenta corriente | Sale paid later by a customer. |
| customer | cliente | Only needed for credit sales. |
| collection | cobro | Money in against a receivable. |
| credit limit | límite de crédito | Optional per customer. |
| capital contribution | aporte de capital | Owner puts money in. |
| withdrawal | retiro | Owner takes money out. |
| equity | patrimonio | Capital plus accumulated net profit. |
| gross profit | utilidad bruta | |
| net profit | utilidad neta | |
| period | período | A calendar month in the tenant timezone. |
| accrual | devengado | Belongs to a period regardless of payment date. |
| lot | lote | v2. Batch with expiry date. |
| expiry date | vencimiento | v2. |
| FEFO | primero en vencer, primero en salir | v2. |
| audit log | registro de auditoría | |

## 2. Business rules

All money is stored as integer centavos of BOB. Examples below show Bs with two decimals for readability.

### S1. Gross profit

`gross_profit(period) = sum(sale_line.total) - sum(sale_line.base_quantity * sale_line.unit_cost)` over confirmed, non-voided sales whose date falls in the period.

This is "what was actually earned on what was sold", as the client phrased it.

### S2. Net profit

`net_profit(period) = gross_profit(period) - sum(expense.amount)` over expenses whose `period` equals the reporting period (see S5).

Worked example, October:

| Item | Bs |
|---|---|
| Sales total | 12,000.00 |
| COGS | 8,400.00 |
| Gross profit (S1) | 3,600.00 |
| Expenses accrued in October (rent 1,500, electricity 200, internet 150) | 1,850.00 |
| Net profit (S2) | 1,750.00 |

### S3. Weighted average cost

Each product has one current `average_cost`. It is recalculated on every purchase:

`new_avg = (current_qty * current_avg + purchase_qty * purchase_unit_cost) / (current_qty + purchase_qty)`

Rounded to the nearest centavo. If `current_qty <= 0`, `new_avg = purchase_unit_cost`.

Every sale line stores `unit_cost = product.average_cost` at the moment of confirmation. Later purchases never change the cost of past sales.

Worked example:

| Event | Qty | Unit cost | Resulting avg |
|---|---|---|---|
| Initial stock | 10 | 5.00 | 5.00 |
| Purchase | 20 | 6.50 | (10*5.00 + 20*6.50) / 30 = 6.00 |
| Sale of 5 units | -5 | snapshot 6.00 | 6.00 (unchanged) |

Adjustments and sales do not change the average. Initial stock from CSV import sets the average to the imported cost.

### S4. Lots (v2)

When the `lots` module is active, stock is tracked per lot with quantity and expiry date. Stock exits follow FEFO (first expiry, first out). Cost stays the product-level weighted average (S3). One profit formula for every tenant.

### S5. Expenses accrue by period

Every expense has a `period` (YYYY-MM in tenant timezone) and optionally a `due_date` and `paid_at`. Reports subtract expenses by `period`, never by `paid_at`. October rent paid on November 5 reduces October net profit.

Recurring expense templates generate one expense per period on the first day of the period (or on demand when the owner opens the month).

### S6. Credit sales count as sales

A credit sale is a confirmed sale on its sale date and contributes to S1 and S2 in that period. The later collection is not revenue. The monthly report shows "pending collection" (sum of open receivable balances) as a separate informational line.

### S7. Purchases are not expenses

A purchase increases stock and recalculates average cost (S3). It never appears in S2. Its effect on profit arrives only through COGS when the goods are sold.

### S8. Capital and equity

`capital = sum(contributions) - sum(withdrawals)`

`equity = capital + sum(net_profit of all periods up to and including the reporting period)`

Capital movements never affect gross or net profit. Only the owner can record or see them.

### S9. Accounts payable

`payables = open expenses (amount - paid_amount) + open credit purchases (total - paid_amount)`

One unified list, sorted by due date, with overdue and upcoming filters. Partial payments are allowed on both kinds.

### S10. VAT is not modeled

Purchase costs and sale prices are final amounts. There is no tax column, rate or breakdown. Adding a fiscal module later does not require changing stored amounts.

### S11. Base units and presentations

Stock is counted in the product base unit. A product has one or more presentations, each with `factor` (how many base units) and `price`. A minimarket product has exactly one presentation with `factor = 1`. A sale line records the presentation, the quantity of presentations and the resulting base quantity (`quantity * factor`). Purchases may also be entered per presentation. The `fractional` module (v2) unlocks multiple presentations in the UI.

### S12. Voiding a sale

Voiding creates reverse stock movements (`void`) for each line and, for credit sales, a reverse receivable entry. The original sale remains with `status = voided`, `voided_at`, `voided_by` and a reason. Voided sales are excluded from S1, S2 and daily totals. Nothing is deleted.

### S13. Negative stock

By default a sale that would drive `stock_level` below zero is rejected with `InsufficientStockError`. The tenant setting `allowNegativeStock = true` permits it; the movement is recorded and the product is flagged in the low-stock view until a purchase or adjustment restores a non-negative level.

## 3. Entities per module (intent level)

| Module | Entity | Key fields |
|---|---|---|
| tenancy | Tenant | id, name, vertical, settings (section 5), timezone, currency, created_at |
| access | Membership | tenant_id, user_id (Supabase auth user), role (`owner`, `employee`), status, invited_by |
| access | TenantContext (runtime value, not a table) | tenant_id, user_id, role, permissions, settings snapshot |
| catalog | Category, Unit, PaymentMethod, ExpenseCategory | tenant_id, name, is_active, sort_order; PaymentMethod has `kind` (`cash`, `qr`, `card`, `transfer`, `credit`) |
| catalog | Product | tenant_id, name, code (optional), category_id, base_unit_id, average_cost, minimum_stock, is_active, attributes (JSONB, v2) |
| catalog | Presentation | product_id, name, factor, price, is_default |
| inventory | StockMovement (append-only) | tenant_id, product_id, type (`initial`, `purchase`, `sale`, `adjustment`, `void`, `expired`), quantity (signed, base units), unit_cost, reference_type, reference_id, reason, created_by, created_at |
| inventory | StockLevel (derived) | tenant_id, product_id, quantity, updated_at |
| inventory | Lot (v2) | product_id, code, expiry_date, quantity |
| purchasing | Supplier | tenant_id, name, phone, notes, is_active |
| purchasing | Purchase | tenant_id, supplier_id, date, payment_type (`cash`, `credit`), total, due_date, status, created_by |
| purchasing | PurchaseLine | purchase_id, product_id, presentation_id, quantity, base_quantity, unit_cost, total |
| sales | Sale | tenant_id, number (per-tenant sequence), date, payment_method_id, customer_id (nullable), total, status (`confirmed`, `voided`), voided_at, voided_by, void_reason, created_by |
| sales | SaleLine | sale_id, product_id, presentation_id, quantity, base_quantity, unit_price, unit_cost (snapshot), total |
| payables | RecurringExpense | tenant_id, category_id, name, amount, day_of_month, is_active |
| payables | Expense | tenant_id, category_id, recurring_expense_id (nullable), name, amount, period, due_date, paid_amount, paid_at |
| payables | Payable (read model) | kind (`expense`, `purchase`), source_id, due_date, amount, paid_amount, balance |
| payables | Payment | tenant_id, payable_kind, payable_id, amount, date, payment_method_id, created_by |
| equity | CapitalMovement | tenant_id, type (`contribution`, `withdrawal`), amount, date, note, created_by |
| reporting | DailySalesReport, MonthlyReport, TopProducts | read models, computed, not stored |
| receivables | Customer | tenant_id, name, phone, document, credit_limit (nullable), is_active |
| receivables | CreditLedgerEntry (append-only) | tenant_id, customer_id, type (`sale`, `collection`, `void`), amount (signed), reference_id, created_at |
| receivables | Collection | tenant_id, customer_id, amount, date, payment_method_id, created_by |
| audit (cross-cutting) | AuditLogEntry | tenant_id, user_id, action, entity_type, entity_id, before, after, created_at |

## 4. Permission matrix

| Capability | owner | employee |
|---|---|---|
| Sell, print receipt | yes | yes |
| Void a sale | yes | only if `employeeCanVoid = true`, own sales, same day |
| View products, stock levels, search | yes | yes |
| Create or edit products and prices | yes | no |
| Register purchases | yes | yes |
| View product cost and average cost | yes | no |
| Stock adjustments | yes | no |
| Suppliers | full | view only |
| Customers and collections (credit) | full | sell on credit and collect; cannot edit credit limits |
| Expenses and payables | yes | no |
| Capital movements | yes | no |
| Reports (daily, monthly) | yes | no |
| Sales of the day list | yes, with cost and profit | yes, without cost or profit |
| Tenant settings, catalogs, modules | yes | no |
| Invite or remove users | yes | no |
| CSV import | yes | no |

Permissions are enforced in application use cases, not only in the UI. Employee DTOs never contain `unit_cost`, `average_cost`, profit or capital fields.

## 5. Tenant settings shape

```json
{
  "vertical": "minimarket",
  "modules": {
    "lots": false,
    "fractional": false,
    "credit_sales": true,
    "custom_fields": false
  },
  "allowNegativeStock": false,
  "employeeCanVoid": false,
  "timezone": "America/La_Paz",
  "currency": "BOB"
}
```

| Preset | modules | Notes |
|---|---|---|
| `minimarket` | credit_sales on, others off | Default for the first client |
| `farmacia` | lots, fractional, credit_sales on | v2 |
| `generic` | all off | Starting point for other verticals |

Presets only seed defaults. The owner or operator can change any flag later.
