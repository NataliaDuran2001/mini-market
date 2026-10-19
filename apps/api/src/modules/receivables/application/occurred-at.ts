import { Period, err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';

/**
 * Instant a collection is stamped with: now for today or no day, the first instant of the local
 * day otherwise. A day after today is refused: nobody collects tomorrow's money today.
 */
export function occurredAtOf(
  occurredOn: string | undefined,
  now: Date,
  timeZone: string,
): Result<Date, DomainError> {
  const today = Period.dayKey(now, timeZone);
  if (occurredOn === undefined || occurredOn === today) return ok(now);
  const range = Period.dayRange(occurredOn, timeZone);
  if (!range.ok) return range;
  if (occurredOn > today)
    return err(new ValidationError('The collection date cannot be in the future'));
  return ok(range.value.start);
}
