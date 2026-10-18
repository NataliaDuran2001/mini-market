import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { DestinationStream } from 'pino';
import { AppModule } from '../src/app.module';
import { loadEnv } from '../src/infrastructure/config/env';
import type { Env } from '../src/infrastructure/config/env';
import type { Database } from '../src/infrastructure/db/database';
import { APP_FACTORY_OPTIONS, configureApp } from '../src/infrastructure/http/configure-app';

export const TEST_WEB_ORIGIN = 'http://localhost:5173';

/** A complete, valid environment for tests. Nothing here is a real credential. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_JWT_ISSUER: 'http://localhost:54321/auth/v1',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

/** Boots the API exactly like `main.ts` does, on an injected database and without listening. */
export async function createTestApp(options: {
  readonly database: Database;
  readonly env?: Env;
  readonly logStream?: DestinationStream;
  /** Throwaway controllers a test needs, for example to prove validation on a request body. */
  readonly controllers?: Type[];
}): Promise<INestApplication> {
  const env = options.env ?? testEnv();
  const version = 'test';
  const moduleRef = await Test.createTestingModule({
    controllers: options.controllers ?? [],
    imports: [
      AppModule.register({
        env,
        version,
        database: options.database,
        ...(options.logStream ? { logStream: options.logStream } : {}),
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>(APP_FACTORY_OPTIONS);
  configureApp(app, { env, version });
  await app.init();
  return app;
}
