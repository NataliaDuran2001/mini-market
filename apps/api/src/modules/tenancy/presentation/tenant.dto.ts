import { tenantResponseSchema, updateTenantSettingsSchema } from '@mini-market/contracts/tenancy';
import { createZodDto } from 'nestjs-zod';

export class TenantResponseDto extends createZodDto(tenantResponseSchema) {}
export class UpdateTenantSettingsDto extends createZodDto(updateTenantSettingsSchema) {}
