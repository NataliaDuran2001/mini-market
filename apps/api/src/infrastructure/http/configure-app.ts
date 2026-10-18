import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Env } from '../config/env';

export const GLOBAL_PREFIX = 'api/v1';
export const BODY_LIMIT = '1mb';
const ONE_YEAR_SECONDS = 31_536_000;

/** Options for `NestFactory.create`: the JSON parser is registered by `configureApp`. */
export const APP_FACTORY_OPTIONS = { bodyParser: false, bufferLogs: true } as const;

/**
 * Cross-cutting HTTP setup shared by `main.ts` and the integration tests, so tests exercise the
 * same prefix, headers, CORS and limits as production. Docs: 05-security.md sections 1 and 4.
 */
export function configureApp(
  app: NestExpressApplication,
  options: { readonly env: Pick<Env, 'nodeEnv' | 'webOrigin'>; readonly version: string },
): void {
  const { env, version } = options;
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // The API serves JSON only; CSP belongs to the web host (05-security.md section 4).
      contentSecurityPolicy: false,
      strictTransportSecurity: { maxAge: ONE_YEAR_SECONDS, includeSubDomains: true },
    }),
  );
  app.enableCors({
    // A list makes the middleware answer only for exactly this origin and stay silent otherwise.
    origin: [env.webOrigin],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Tenant-Id'],
    credentials: false,
  });
  app.useBodyParser('json', { limit: BODY_LIMIT });
  app.enableShutdownHooks();
  if (env.nodeEnv !== 'production') {
    setupSwagger(app, version);
  }
}

function setupSwagger(app: NestExpressApplication, version: string): void {
  const config = new DocumentBuilder()
    .setTitle('Mini-Market API')
    .setVersion(version)
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-Id', in: 'header' }, 'tenant')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
  );
}
