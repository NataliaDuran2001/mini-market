import { SetMetadata, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { REQUIRED_PERMISSION_KEY, WITHOUT_TENANT_KEY } from '../application/request-identity';
import type { AuthenticatedRequest, TenantContext } from '../application/request-identity';

/**
 * The route needs a signed-in user but no tenant, so no `X-Tenant-Id` is read: `/me`, the tenant
 * picker, accepting an invitation. Without it every route is tenant scoped.
 */
export const WithoutTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(WITHOUT_TENANT_KEY, true);

/** The caller must hold this permission, for example `@RequirePermission('sales.void')`. */
export const RequirePermission = (permission: string): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/** The `TenantContext` the tenant guard built for this request. Pass it to the use case. */
export const Ctx = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const { tenantScope } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!tenantScope) {
      // Reached a handler without a tenant: the route is @Public() or @WithoutTenant() and asks for one.
      throw new Error('@Ctx() used on a route that is not tenant scoped');
    }
    return tenantScope;
  },
);
