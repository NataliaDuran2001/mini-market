import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenError } from '@mini-market/shared-kernel';
import type { TenantScope } from '../application/tenant-scope';

/**
 * Reads the caller scope that the tenant guard of issue #11 puts on the request. Until that guard
 * exists nothing sets it, so these routes answer 403: they fail closed instead of guessing a tenant.
 */
export const CurrentTenantScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantScope => {
    const request = context.switchToHttp().getRequest<{ tenantScope?: TenantScope }>();
    if (!request.tenantScope) throw new ForbiddenError('No tenant context on this request');
    return request.tenantScope;
  },
);
