import { Module } from '@nestjs/common';
import type { Clock } from '@mini-market/shared-kernel';
import type { DomainEventBus } from '../../infrastructure/events/domain-event-bus';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, DOMAIN_EVENT_BUS, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { CREATE_TENANT, createTenant } from './application/create-tenant';
import { GET_TENANT_SETTINGS, getTenantSettings } from './application/get-tenant-settings';
import type { EventPublisher } from './application/ports/event-publisher';
import type { TenantRepository } from './application/ports/tenant.repository';
import { UPDATE_TENANT_SETTINGS, updateTenantSettings } from './application/update-tenant-settings';
import { createTenantRepository } from './infrastructure/tenant.repository';
import { TenantController } from './presentation/tenant.controller';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');
const TENANT_EVENTS = Symbol('TENANT_EVENTS');

@Module({
  controllers: [TenantController],
  providers: [
    {
      provide: TENANT_REPOSITORY,
      useFactory: (withTransaction: WithTransaction) => createTenantRepository(withTransaction),
      inject: [WITH_TRANSACTION],
    },
    {
      provide: TENANT_EVENTS,
      useFactory: (bus: DomainEventBus): EventPublisher => ({
        publish: (events) => bus.dispatch(events),
      }),
      inject: [DOMAIN_EVENT_BUS],
    },
    {
      provide: CREATE_TENANT,
      useFactory: (tenants: TenantRepository, events: EventPublisher, clock: Clock) =>
        createTenant.bind(null, { tenants, events, clock }),
      inject: [TENANT_REPOSITORY, TENANT_EVENTS, CLOCK],
    },
    {
      provide: GET_TENANT_SETTINGS,
      useFactory: (tenants: TenantRepository) => getTenantSettings.bind(null, { tenants }),
      inject: [TENANT_REPOSITORY],
    },
    {
      provide: UPDATE_TENANT_SETTINGS,
      useFactory: (tenants: TenantRepository, clock: Clock) =>
        updateTenantSettings.bind(null, { tenants, clock }),
      inject: [TENANT_REPOSITORY, CLOCK],
    },
  ],
  exports: [CREATE_TENANT, GET_TENANT_SETTINGS, TENANT_REPOSITORY, UPDATE_TENANT_SETTINGS],
})
export class TenancyModule {}
