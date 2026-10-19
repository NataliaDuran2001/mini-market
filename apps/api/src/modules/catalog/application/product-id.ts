import { uuidSchema } from '@mini-market/contracts/common';
import { err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';

/** The `:id` of the path. A malformed id cannot match any product. */
export function parseProductId(value: string): Result<string, NotFoundError> {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new NotFoundError('Product not found'));
}
