import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { DestinationStream } from 'pino';
import { AppModule } from '../src/app.module';
import { loadEnv } from '../src/infrastructure/config/env';
import type { Env } from '../src/infrastructure/config/env';
import type { Database } from '../src/infrastructure/db/database';
import { APP_FACTORY_OPTIONS, configureApp } from '../src/infrastructure/http/configure-app';
import { JWKS_PROVIDER } from '../src/modules/access/infrastructure/auth/jwks';
import { createTestAuth, TEST_ISSUER } from './auth';
import type { TestAuth, TokenOptions } from './auth';

export const TEST_WEB_ORIGIN = 'http://localhost:5173';

/** A complete, valid environment for tests. Nothing here is a real credential. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_JWT_ISSUER: TEST_ISSUER,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

const authByApp = new WeakMap<INestApplication, TestAuth>();

/**
 * `Authorization` header value for a caller. Every route except `@Public()` ones needs it, and
 * `createTestApp` already trusts the keys of the auth it created for that app.
 */
export async function bearerFor(app: INestApplication, claims?: TokenOptions): Promise<string> {
  const auth = authByApp.get(app);
  if (!auth) throw new Error('bearerFor needs an app created by createTestApp');
  return `Bearer ${await auth.signToken(claims)}`;
}

/** Boots the API exactly like `main.ts` does, on an injected database and without listening. */
export async function createTestApp(options: {
  readonly database: Database;
  readonly env?: Env;
  readonly logStream?: DestinationStream;
  /** Throwaway controllers a test needs, for example to prove validation on a request body. */
  readonly controllers?: Type[];
  /** Replaces providers by token, for example the Supabase admin client. */
  readonly overrides?: readonly { readonly token: symbol; readonly useValue: unknown }[];
  /** Key pair the app trusts. Defaults to a fresh one; read it back through `bearerFor`. */
  readonly auth?: TestAuth;
}): Promise<INestApplication> {
  const env = options.env ?? testEnv();
  const version = 'test';
  const auth = options.auth ?? (await createTestAuth());
  const builder = Test.createTestingModule({
    controllers: options.controllers ?? [],
    imports: [
      AppModule.register({
        env,
        version,
        database: options.database,
        ...(options.logStream ? { logStream: options.logStream } : {}),
      }),
    ],
  });
  builder.overrideProvider(JWKS_PROVIDER).useValue(auth.jwks);
  for (const override of options.overrides ?? []) {
    builder.overrideProvider(override.token).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_FACTORY_OPTIONS);
  configureApp(app, { env, version });
  await app.init();
  authByApp.set(app, auth);
  return app;
}
