import 'reflect-metadata';
import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { EnvValidationError, loadEnv } from './infrastructure/config/env';
import { APP_FACTORY_OPTIONS, configureApp } from './infrastructure/http/configure-app';

/** Loads a local `.env` for development. `ENV_FILE` overrides the path; a missing file is fine. */
function loadLocalEnvFile(): void {
  try {
    process.loadEnvFile(process.env['ENV_FILE'] ?? '.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; // only "no file" is expected
  }
}

function readEnvOrExit() {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();
  const env = readEnvOrExit();
  // From src/ and from dist/ the package manifest is one level up.
  const { version } = createRequire(__filename)('../package.json') as { version: string };
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register({ env, version }),
    APP_FACTORY_OPTIONS,
  );
  configureApp(app, { env, version });
  await app.listen(env.port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
