import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  FixedClock,
  ForbiddenError,
  NotFoundError,
  SystemClock,
  ValidationError,
  andThen,
  err,
  isErr,
  isOk,
  map,
  ok,
  unwrapOr,
  unwrapOrThrow,
  type Result,
} from '../src/index.js';

class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly httpStatus = 422;
}

const half = (n: number): Result<number, NotFoundError> =>
  n % 2 === 0 ? ok(n / 2) : err(new NotFoundError('odd'));

describe('Result', () => {
  it('builds and discriminates Ok and Err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
    expect(isOk(ok(1))).toBe(true);
    expect(isOk(err('x'))).toBe(false);
    expect(isErr(err('x'))).toBe(true);
    expect(isErr(ok(1))).toBe(false);
  });

  it('maps only the Ok side', () => {
    expect(map(ok(2), (n) => n + 1)).toEqual(ok(3));
    const failure = err('x');
    expect(map(failure, (n: number) => n + 1)).toBe(failure);
  });

  it('chains with andThen and short-circuits on the first Err', () => {
    expect(andThen(ok(8), half)).toEqual(ok(4));
    const chained = andThen(andThen(half(12), half), half); // 12 -> 6 -> 3 -> odd
    expect(chained.ok).toBe(false);
    if (chained.ok) return;
    expect(chained.error.code).toBe('NOT_FOUND');
    const failure = err(new ConflictError('first'));
    expect(andThen(failure, half)).toBe(failure);
  });

  it('unwraps with a fallback or by throwing', () => {
    expect(unwrapOr(ok(1), 9)).toBe(1);
    expect(unwrapOr(err('x'), 9)).toBe(9);
    expect(unwrapOrThrow(ok(1))).toBe(1);
    const failure = new ForbiddenError('no');
    expect(() => unwrapOrThrow(err(failure))).toThrow(failure);
    expect(() => unwrapOrThrow(err('plain text'))).toThrow('plain text');
  });
});

describe('DomainError', () => {
  it('exposes code, http status hint, message and details on the common errors', () => {
    const cases = [
      [new NotFoundError('missing', { id: 'p1' }), 'NOT_FOUND', 404],
      [new ForbiddenError('denied'), 'FORBIDDEN', 403],
      [new ValidationError('bad'), 'VALIDATION_ERROR', 400],
      [new ConflictError('dup'), 'CONFLICT', 409],
    ] as const;
    for (const [error, code, status] of cases) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe(code);
      expect(error.httpStatus).toBe(status);
    }
    expect(cases[0][0].message).toBe('missing');
    expect(cases[0][0].details).toEqual({ id: 'p1' });
    expect(cases[1][0].details).toBeUndefined();
  });

  it('lets modules extend it with their own stable code and keeps the class name', () => {
    const error = new InsufficientStockError('not enough', { productId: 'p1' });
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.httpStatus).toBe(422);
    expect(error.name).toBe('InsufficientStockError');
  });
});

describe('Clock', () => {
  it('FixedClock returns the same instant until set, and never leaks its internal Date', () => {
    const clock = new FixedClock('2026-10-15T14:00:00Z');
    expect(clock.now().toISOString()).toBe('2026-10-15T14:00:00.000Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-10-15T14:00:00.000Z');
    clock.set(new Date('2026-11-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('FixedClock rejects an invalid instant', () => {
    expect(() => new FixedClock('not a date')).toThrow(RangeError);
    expect(() => new FixedClock('2026-10-15').set('nope')).toThrow(RangeError);
  });

  it('SystemClock returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
