import { DomainError } from '@mini-market/shared-kernel';

/** Another supplier of the same tenant already has this name (compared ignoring case). */
export class SupplierNameTakenError extends DomainError {
  readonly code = 'SUPPLIER_NAME_TAKEN';
  readonly httpStatus = 409;
}

/** No supplier with this id in the tenant; the same answer for an id of another tenant. */
export class SupplierNotFoundError extends DomainError {
  readonly code = 'SUPPLIER_NOT_FOUND';
  readonly httpStatus = 404;
}
