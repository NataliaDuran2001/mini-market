import { ForbiddenError } from '@mini-market/shared-kernel';
import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION_KEY } from '../../application/request-identity';
import type { AuthenticatedRequest } from '../../application/request-identity';
import { requirePermission } from '../../application/require-permission';

/**
 * Global guard, runs after the tenant guard: when a route declares `@RequirePermission(name)` the
 * caller's context must hold it, else 403 FORBIDDEN naming the permission. Use cases check the
 * same permission again with `ctx.can` (defense in depth, docs/05-security.md section 1).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return false;
    // Class and method may both declare one; the caller must hold every one of them, so a weaker
    // permission on a method cannot replace a stronger one on its controller.
    const required = this.reflector
      .getAll<(string | undefined)[]>(REQUIRED_PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
      .filter((permission): permission is string => typeof permission === 'string');

    const { tenantScope } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    for (const permission of required) {
      // A permission on a route without a tenant context can never be granted: fail closed.
      const allowed = tenantScope
        ? requirePermission(tenantScope, permission)
        : { ok: false as const, error: new ForbiddenError('No tenant context', { permission }) };
      if (!allowed.ok) throw allowed.error;
    }
    return true;
  }
}
