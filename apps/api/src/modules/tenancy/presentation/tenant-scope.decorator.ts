import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '@mini-market/shared-kernel';
import type { TenantScope } from '../application/tenant-scope';

/**
 * Reads the caller scope that the tenant guard of the access module puts on the request
 * (`request.tenantScope`, a TenantContext). Without it the route answers 403: it fails closed
 * instead of guessing a tenant.
 */
export const CurrentTenantScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantScope => {
    const request = context.switchToHttp().getRequest<{ tenantScope?: TenantScope }>();
    if (!request.tenantScope) throw new ForbiddenError('No tenant context on this request');
    return request.tenantScope;
  },
);
