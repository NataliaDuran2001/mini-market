import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import type { Env } from '../config/env';

/** Never log credentials (docs/05-security.md section 1). */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.databaseUrl',
  '*.supabaseServiceRoleKey',
  // Query errors carry the bound parameters (see describe-error.ts)
  'err.params',
  'err.query',
  'err.cause.params',
] as const;

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller supplied id only when it is short and plain, so it cannot forge log lines.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** Uses the incoming `x-request-id` when safe, else a new UUID, and echoes it on the response. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id = candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * @param stream destination for log lines; tests pass an in-memory stream. Without it, logs go to
 *   stdout as JSON (pretty-printed in development).
 */
export function buildLoggerParams(
  env: Pick<Env, 'logLevel' | 'nodeEnv'>,
  stream?: DestinationStream,
): Params {
  const options = {
    level: env.logLevel,
    genReqId: resolveRequestId,
    redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' },
    ...(!stream && env.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
  };
  return { pinoHttp: stream ? [options, stream] : options };
}
