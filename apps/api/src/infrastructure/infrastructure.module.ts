import { Global, Inject, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown, Provider } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import type { Env } from './config/env';
import { createDatabase } from './db/database';
import type { Database, DatabaseConnection } from './db/database';
import { createWithTransaction } from './db/with-transaction';
import { DomainEventBus } from './events/domain-event-bus';
import {
  APP_VERSION,
  DATABASE,
  DATABASE_CONNECTION,
  DOMAIN_EVENT_BUS,
  ENV,
  WITH_TRANSACTION,
} from './tokens';

export interface InfrastructureOptions {
  readonly env: Env;
  readonly version: string;
  /** Replaces the postgres.js connection; tests pass PGlite here and close it themselves. */
  readonly database?: Database;
}

/** Global providers every module may inject: env, database, transaction helper, event bus. */
@Global()
@Module({})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  static register(options: InfrastructureOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: ENV, useValue: options.env },
      { provide: APP_VERSION, useValue: options.version },
      {
        provide: DATABASE_CONNECTION,
        useFactory: (): DatabaseConnection =>
          options.database
            ? { db: options.database, close: () => Promise.resolve() }
            : createDatabase(options.env.databaseUrl),
      },
      {
        provide: DATABASE,
        useFactory: (connection: DatabaseConnection) => connection.db,
        inject: [DATABASE_CONNECTION],
      },
      {
        provide: DOMAIN_EVENT_BUS,
        useFactory: (logger: Logger) =>
          new DomainEventBus((event, error) =>
            logger.error({ err: error, eventType: event.type }, 'domain event handler failed'),
          ),
        inject: [Logger],
      },
      {
        provide: WITH_TRANSACTION,
        useFactory: (db: Database, bus: DomainEventBus) => createWithTransaction(db, bus),
        inject: [DATABASE, DOMAIN_EVENT_BUS],
      },
    ];
    return {
      module: InfrastructureModule,
      providers,
      exports: [APP_VERSION, DATABASE, DOMAIN_EVENT_BUS, ENV, WITH_TRANSACTION],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
