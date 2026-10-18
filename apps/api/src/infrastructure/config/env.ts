import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const DEFAULT_PORT = 3001;

const postgresUrl = z
  .string()
  .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// or postgresql:// connection string');
const port = z.coerce.number().int().min(1).max(65535);

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

export type Env = ReturnType<typeof loadEnv>;

/**
 * Validates the environment once, at startup (docs/05-security.md section 1).
 * @param source defaults to `process.env`; tests pass fixtures.
 * @throws EnvValidationError listing every invalid key, without values.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env) {
  const env = createEnv({
    server: {
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      DATABASE_URL: postgresUrl,
      SUPABASE_URL: z.url(),
      SUPABASE_JWT_ISSUER: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
      WEB_ORIGIN: z.url(),
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

  return {
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseJwtIssuer: env.SUPABASE_JWT_ISSUER,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    webOrigin: env.WEB_ORIGIN,
    port: env.API_PORT ?? env.PORT ?? DEFAULT_PORT,
    logLevel: env.LOG_LEVEL,
  } as const;
}
