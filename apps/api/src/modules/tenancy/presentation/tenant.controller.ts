import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { GET_TENANT_SETTINGS } from '../application/get-tenant-settings';
import type { GetTenantSettings } from '../application/get-tenant-settings';
import type { TenantScope } from '../application/tenant-scope';
import type { TenantView } from '../application/tenant-view';
import { UPDATE_TENANT_SETTINGS } from '../application/update-tenant-settings';
import type { UpdateTenantSettings } from '../application/update-tenant-settings';
import { CurrentTenantScope } from './tenant-scope.decorator';
import { TenantResponseDto, UpdateTenantSettingsDto } from './tenant.dto';

// Domain errors thrown by unwrapOrThrow are mapped to HTTP by the global DomainErrorFilter.
@Controller('tenant')
export class TenantController {
  constructor(
    @Inject(GET_TENANT_SETTINGS) private readonly getTenantSettings: GetTenantSettings,
    @Inject(UPDATE_TENANT_SETTINGS) private readonly updateTenantSettings: UpdateTenantSettings,
  ) {}

  @Get()
  @ZodSerializerDto(TenantResponseDto)
  async get(@CurrentTenantScope() scope: TenantScope): Promise<TenantView> {
    return unwrapOrThrow(await this.getTenantSettings(scope));
  }

  @Patch('settings')
  @ZodSerializerDto(TenantResponseDto)
  async patchSettings(
    @CurrentTenantScope() scope: TenantScope,
    @Body() body: UpdateTenantSettingsDto,
  ): Promise<TenantView> {
    return unwrapOrThrow(await this.updateTenantSettings(scope, body));
  }
}
