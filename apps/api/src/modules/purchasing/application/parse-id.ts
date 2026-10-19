import { uuidSchema } from '@mini-market/contracts/common';
import { err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';

/** Validates an id that arrives in the path, so a malformed one answers 400 and not a database error. */
export function parseId(value: unknown, field: string): Result<string, ValidationError> {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? ok(parsed.data) : err(new ValidationError(`${field} must be a UUID`));
}
