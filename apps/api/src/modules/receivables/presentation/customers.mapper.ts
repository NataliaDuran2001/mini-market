import type {
  Customer as CustomerDto,
  CustomerStatement as CustomerStatementDto,
  LedgerLine,
  ListReceivablesResponse,
  RegisterCollectionResponse,
} from '@mini-market/contracts/receivables';
import type { Money } from '@mini-market/shared-kernel';
import type { RegisteredCollection } from '../application/register-collection';
import type { CustomerStatement } from '../application/get-customer-statement';
import type { ReceivablesView } from '../application/list-balances';
import type { Customer, StatementLine } from '../application/views';

/**
 * Wire money is a safe integer of centavos (`moneySchema`); the response schema checks it. A
 * balance above Number.MAX_SAFE_INTEGER (about Bs 90 trillion) is out of range by decision.
 */
const centavos = (money: Money): number => Number(money.toCentavos());

export const toCustomerDto = (customer: Customer): CustomerDto => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone,
  documentId: customer.documentId,
  creditLimitCentavos:
    customer.creditLimitCentavos === null ? null : Number(customer.creditLimitCentavos),
  notes: customer.notes,
  active: customer.active,
});

export const toLineDto = ({ entry, balanceAfter }: StatementLine): LedgerLine => ({
  id: entry.id,
  kind: entry.kind,
  amountCentavos: centavos(entry.amount),
  balanceAfterCentavos: centavos(balanceAfter),
  occurredAt: entry.occurredAt.toISOString(),
  referenceType: entry.reference?.type ?? null,
  referenceId: entry.reference?.id ?? null,
  paymentMethod: entry.paymentMethod,
  createdBy: entry.createdBy,
});

export const toStatementDto = (statement: CustomerStatement): CustomerStatementDto => ({
  customer: toCustomerDto(statement.customer),
  balanceCentavos: centavos(statement.balance),
  lines: statement.lines.map(toLineDto),
});

export const toCollectionDto = (collected: RegisteredCollection): RegisterCollectionResponse => ({
  line: toLineDto({ entry: collected.entry, balanceAfter: collected.balance }),
  balanceCentavos: centavos(collected.balance),
});

export const toReceivablesDto = (view: ReceivablesView): ListReceivablesResponse => ({
  items: view.items.map((row) => ({
    customer: toCustomerDto(row.customer),
    balanceCentavos: centavos(row.balance),
    overdueDays: row.overdueDays,
  })),
  totalPendingCentavos: centavos(view.totalPending),
});
