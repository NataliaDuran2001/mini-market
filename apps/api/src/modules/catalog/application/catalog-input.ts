import { uuidSchema } from '@mini-market/contracts/common';
import { err, NotFoundError, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import type { ZodError } from 'zod';
import { isCatalogKind } from '../domain/catalog-item';
import type { CatalogKind } from '../domain/catalog-item';

/** The `:kind` of the path. A name that is not a catalog is a missing resource, not bad input. */
export function parseCatalogKind(value: string): Result<CatalogKind, NotFoundError> {
  return isCatalogKind(value)
    ? ok(value)
    : err(new NotFoundError('Unknown catalog', { kind: value }));
}

/** The `:id` of the path. A malformed id cannot match any row. */
export function parseCatalogItemId(value: string): Result<string, NotFoundError> {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new NotFoundError('Catalog item not found'));
}

/** Same `details` shape as the global exception filter: `{ issues: [{ path, message }] }`. */
export function validationError(message: string, error: ZodError): ValidationError {
  return new ValidationError(message, {
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
}
