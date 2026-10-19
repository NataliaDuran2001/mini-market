import { DomainError } from '@mini-market/shared-kernel';

/** S13: the sale or movement would leave the product below zero and the tenant forbids it. */
export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly httpStatus = 409;
}

/** The opening stock can only be set while the product has no movement at all. */
export class StockAlreadyStartedError extends DomainError {
  readonly code = 'STOCK_ALREADY_STARTED';
  readonly httpStatus = 409;
}
