import { DomainError } from '@mini-market/shared-kernel';

/** A name or code that another item of the same catalog already uses in this tenant. */
export class DuplicateCatalogItemError extends DomainError {
  readonly code = 'DUPLICATE_CATALOG_ITEM';
  readonly httpStatus = 409;
}

/** The product code is already used by another product of the tenant. */
export class DuplicateCodeError extends DomainError {
  readonly code = 'DUPLICATE_CODE';
  readonly httpStatus = 409;
}
