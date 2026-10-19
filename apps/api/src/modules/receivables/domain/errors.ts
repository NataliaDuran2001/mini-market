import { DomainError } from '@mini-market/shared-kernel';

/** No customer with this id in the tenant; the same answer for an id of another tenant. */
export class CustomerNotFoundError extends DomainError {
  readonly code = 'CUSTOMER_NOT_FOUND';
  readonly httpStatus = 404;
}

/** The charge would take the balance above the credit limit of the customer. */
export class CreditLimitExceededError extends DomainError {
  readonly code = 'CREDIT_LIMIT_EXCEEDED';
  readonly httpStatus = 409;
}

/** An inactive customer cannot be charged. */
export class CustomerInactiveError extends DomainError {
  readonly code = 'CUSTOMER_INACTIVE';
  readonly httpStatus = 409;
}

/** A collection larger than what the customer owes: the balance would go negative. */
export class CollectionExceedsBalanceError extends DomainError {
  readonly code = 'COLLECTION_EXCEEDS_BALANCE';
  readonly httpStatus = 409;
}

/** There is no charge for this sale, so there is nothing to reverse. */
export class ChargeNotFoundError extends DomainError {
  readonly code = 'CHARGE_NOT_FOUND';
  readonly httpStatus = 404;
}

/** The charge of this sale was already reversed. */
export class ChargeAlreadyReversedError extends DomainError {
  readonly code = 'CHARGE_ALREADY_REVERSED';
  readonly httpStatus = 409;
}

/** A charge for this sale already exists: a sale is charged once. */
export class ChargeAlreadyRegisteredError extends DomainError {
  readonly code = 'CHARGE_ALREADY_REGISTERED';
  readonly httpStatus = 409;
}
