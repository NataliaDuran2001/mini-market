import { DomainError } from '@mini-market/shared-kernel';

/** A name or code that another item of the same catalog already uses in this tenant. */
export class DuplicateCatalogItemError extends DomainError {
  readonly code = 'DUPLICATE_CATALOG_ITEM';
  readonly httpStatus = 409;
}
