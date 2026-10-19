// Public API of the receivables module: the only file other modules may import. Sales (#57)
// charges and reverses credit sales through `REGISTER_CHARGE` and `REVERSE_CHARGE` inside its own
// transaction; the monthly report (#51) reads the exported tables for "pending collection" (S6).
export { REGISTER_CHARGE } from './application/register-charge';
export type { RegisterCharge } from './application/register-charge';
export { REVERSE_CHARGE } from './application/reverse-charge';
export type { ReverseCharge } from './application/reverse-charge';
export { balanceOf } from './domain/credit-ledger';
export type {
  CollectionMethod,
  LedgerEntry,
  LedgerKind,
  LedgerReference,
} from './domain/credit-ledger';
export type { Customer } from './domain/customer';
export {
  ChargeAlreadyRegisteredError,
  ChargeAlreadyReversedError,
  ChargeNotFoundError,
  CollectionExceedsBalanceError,
  CreditLimitExceededError,
  CustomerInactiveError,
  CustomerNotFoundError,
} from './domain/errors';
export { creditLedger, customers } from './infrastructure/schema';
export { RECEIVABLES_PERMISSIONS } from './receivables.permissions';
export { ReceivablesModule } from './receivables.module';
