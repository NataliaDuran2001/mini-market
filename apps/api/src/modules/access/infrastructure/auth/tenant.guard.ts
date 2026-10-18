import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { parseUuid } from '../../application/parse-uuid';
import { RESOLVE_TENANT_CONTEXT } from '../../application/resolve-tenant-context';
import type { ResolveTenantContext } from '../../application/resolve-tenant-context';
import {
  PUBLIC_ROUTE_KEY,
  TENANT_HEADER,
  WITHOUT_TENANT_KEY,
} from '../../application/request-identity';
import type { AuthenticatedRequest } from '../../application/request-identity';

interface HttpRequest extends AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Global guard, runs after the JWT guard: every route is tenant scoped unless it is `@Public()` or
 * `@WithoutTenant()`. It reads `X-Tenant-Id`, verifies an active membership and puts the resulting
 * `TenantContext` on the request (`@Ctx()` reads it). Denied callers get the DomainError through
 * the global filter: 400 for a malformed header, 403 NOT_A_MEMBER otherwise.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RESOLVE_TENANT_CONTEXT) private readonly resolve: ResolveTenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return false;
    const targets = [context.getHandler(), context.getClass()];
    const skip =
      this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ROUTE_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean | undefined>(WITHOUT_TENANT_KEY, targets);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    if (!request.user) {
      // The JWT guard is registered first; reaching this point without it is a wiring bug.
      throw new Error('TenantGuard ran before the JWT guard');
    }
    const tenantId = parseUuid(request.headers[TENANT_HEADER], 'X-Tenant-Id');
    if (!tenantId.ok) throw tenantId.error;
    const resolved = await this.resolve({ userId: request.user.userId, tenantId: tenantId.value });
    if (!resolved.ok) throw resolved.error;
    request.tenantScope = resolved.value;
    return true;
  }
}
