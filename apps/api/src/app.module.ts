import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import type { DestinationStream } from 'pino';
import { APP_MODULES } from './app.modules';
import type { Env } from './infrastructure/config/env';
import type { Database } from './infrastructure/db/database';
import { ApiExceptionFilter } from './infrastructure/http/api-exception.filter';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { buildLoggerParams } from './infrastructure/logger/logger.config';

export interface AppModuleOptions {
  readonly env: Env;
  readonly version: string;
  /** Tests inject PGlite here instead of connecting to `DATABASE_URL`. */
  readonly database?: Database;
  /** Tests capture log lines here. */
  readonly logStream?: DestinationStream;
}

@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        LoggerModule.forRoot(buildLoggerParams(options.env, options.logStream)),
        InfrastructureModule.register({
          env: options.env,
          version: options.version,
          ...(options.database ? { database: options.database } : {}),
        }),
        ...APP_MODULES,
      ],
      providers: [
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}
