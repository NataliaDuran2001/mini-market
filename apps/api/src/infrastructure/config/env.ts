import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const DEFAULT_PORT = 3001;

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// or postgresql:// connection string');
const port = z.coerce.number().int().min(1).max(65535);

// The browser sends `Origin` as scheme, host and port only, so the allowed origin must have no
// path: `http://localhost:5173/` is accepted and normalized, `http://localhost:5173/app` is not.
const webOrigin = z
  .url()
  .refine(
    (value) => {
      if (!URL.canParse(value)) return true; // z.url() already reported it
      const url = new URL(value);
      return url.pathname === '/' && url.search === '' && url.hash === '';
    },
    {
      message:
        'must be an origin without path, query or fragment (for example http://localhost:5173)',
    },
  )
  .transform((value) => new URL(value).origin);

/** Raised when the environment is missing or malformed. Never carries the offending values. */
export class EnvValidationError extends Error {
  constructor(
    readonly invalidKeys: readonly string[],
    readonly details: readonly string[],
  ) {
    super(`Invalid environment variables:\n${details.map((detail) => `  - ${detail}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validated configuration. `databaseUrl` and `supabaseServiceRoleKey` are non-enumerable, so
 * `JSON.stringify(env)`, `util.inspect(env)` and `{ ...env }` never print or copy them.
 */
export interface Env {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly supabaseJwtIssuer: string;
  readonly supabaseServiceRoleKey: string;
  readonly webOrigin: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
}

/**
 * Validates the environment once, at startup (docs/05-security.md section 1).
 * @param source defaults to `process.env`; tests pass fixtures.
 * @throws EnvValidationError listing every invalid key, without values.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = createEnv({
    server: {
      // Fail safe: a host that forgets NODE_ENV gets production behaviour (no Swagger UI, JSON logs).
      NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
      DATABASE_URL: postgresUrl,
      SUPABASE_URL: z.url(),
      SUPABASE_JWT_ISSUER: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
      WEB_ORIGIN: webOrigin,
      // Lanes run several APIs side by side and choose the port with API_PORT; hosts such as
      // Railway inject PORT. API_PORT wins, then PORT, then 3001.
      API_PORT: port.optional(),
      PORT: port.optional(),
      LOG_LEVEL: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
    },
    runtimeEnv: source,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const keys = new Set<string>();
      const details = issues.map((issue) => {
        const key = issue.path
          ?.map((part) => String(typeof part === 'object' ? part.key : part))
          .join('.');
        keys.add(key ?? '(unknown)');
        return `${key ?? '(unknown)'}: ${issue.message}`;
      });
      throw new EnvValidationError([...keys], details);
    },
  });

  const publicConfig = {
    nodeEnv: env.NODE_ENV,
    supabaseUrl: env.SUPABASE_URL,
    supabaseJwtIssuer: env.SUPABASE_JWT_ISSUER,
    webOrigin: env.WEB_ORIGIN,
    port: env.API_PORT ?? env.PORT ?? DEFAULT_PORT,
    logLevel: env.LOG_LEVEL,
  };
  return Object.defineProperties(publicConfig, {
    databaseUrl: { value: env.DATABASE_URL, enumerable: false },
    supabaseServiceRoleKey: { value: env.SUPABASE_SERVICE_ROLE_KEY, enumerable: false },
  }) as Env; // defineProperties adds the two secret keys that the literal's type does not know
}
