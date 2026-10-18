import { DomainError } from '@mini-market/shared-kernel';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { describeError } from '../logger/describe-error';

/** Shape of every error response (ADR 0013, `apiErrorSchema` in `@mini-market/contracts/common`). */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

interface Mapped {
  readonly status: number;
  readonly body: Omit<ApiErrorBody, 'requestId'>;
}

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

const INTERNAL: Mapped = {
  status: 500,
  body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const codeForStatus = (status: number): string => STATUS_CODES[status] ?? `HTTP_${status}`;

function fromHttpException(exception: HttpException): Mapped {
  const status = exception.getStatus();
  const response = exception.getResponse();
  if (isRecord(response) && typeof response['code'] === 'string') {
    const message = typeof response['message'] === 'string' ? response['message'] : exception.message;
    return { status, body: { code: response['code'], message } };
  }
  return { status, body: { code: codeForStatus(status), message: exception.message } };
}

/** Errors raised by express middleware such as body-parser (`status` and `expose`). */
function fromMiddlewareError(error: Record<string, unknown>): Mapped | undefined {
  const status = error['status'];
  if (typeof status !== 'number' || status < 400 || status > 499 || error['expose'] !== true) {
    return undefined;
  }
  return { status, body: { code: codeForStatus(status), message: String(error['message'] ?? '') } };
}

function fromValidation(exception: ZodValidationException): Mapped {
  const zodError: unknown = exception.getZodError();
  const issues = isRecord(zodError) && Array.isArray(zodError['issues']) ? zodError['issues'] : [];
  return {
    status: 400,
    body: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        issues: issues.filter(isRecord).map((issue) => ({
          path: Array.isArray(issue['path']) ? issue['path'].join('.') : '',
          message: String(issue['message'] ?? ''),
        })),
      },
    },
  };
}

/**
 * The only place that turns exceptions into HTTP responses (docs/04-coding-standards.md section 4):
 * `DomainError` keeps its code and status, framework errors get a stable code, anything else is a
 * bug and answers 500 without internals.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: unknown }>();
    const response = http.getResponse<Response>();
    const mapped = this.map(exception);
    const requestId =
      typeof request.id === 'string' ? request.id : response.getHeader('x-request-id');
    response.status(mapped.status).json({
      ...mapped.body,
      ...(typeof requestId === 'string' ? { requestId } : {}),
    });
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof DomainError) {
      return {
        status: exception.httpStatus,
        body: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      };
    }
    if (exception instanceof ZodValidationException) return fromValidation(exception);
    if (exception instanceof ZodSerializationException) return this.bug(exception);
    if (exception instanceof HttpException) return fromHttpException(exception);
    if (isRecord(exception)) {
      const mapped = fromMiddlewareError(exception);
      if (mapped) return mapped;
    }
    return this.bug(exception);
  }

  /** Unexpected failure: log what is safe, answer 500. */
  private bug(exception: unknown): Mapped {
    this.logger.error({ error: describeError(exception) }, 'unhandled exception');
    return INTERNAL;
  }
}
