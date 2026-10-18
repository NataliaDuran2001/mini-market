/**
 * Failure of a call to the API. `code` is the stable English identifier of the server DomainError
 * (docs/04-coding-standards.md section 3); the web translates it, it never shows server text.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(options: { status: number; code: string; message?: string; details?: unknown }) {
    super(options.message ?? options.code);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

/** Status 0: the request never reached the API (offline, DNS, CORS). */
export const NETWORK_ERROR_CODE = 'network_error';
export const UNKNOWN_ERROR_CODE = 'unknown_error';
