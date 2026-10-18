import { err, ForbiddenError, ok } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import type { TenantContext } from '../domain/tenant-context';

/**
 * First line of a use case (docs/04-coding-standards.md section 3):
 * `const allowed = requirePermission(ctx, 'members.manage'); if (!allowed.ok) return allowed;`
 * The error names the permission so the web can explain what is missing.
 */
export function requirePermission(
  ctx: Pick<TenantContext, 'can'>,
  permission: string,
): Result<void, ForbiddenError> {
  if (ctx.can(permission)) return ok(undefined);
  return err(new ForbiddenError(`Missing permission ${permission}`, { permission }));
}
