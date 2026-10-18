// Base class for expected business failures (ADR 0013). Concrete errors declare a stable `code`
// (the web translates it) and an HTTP status hint (one global filter maps it in the API).

export type ErrorDetails = Readonly<Record<string, unknown>>;

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  readonly details: ErrorDetails | undefined;

  constructor(message: string, details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
  readonly httpStatus = 403;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly httpStatus = 409;
}
