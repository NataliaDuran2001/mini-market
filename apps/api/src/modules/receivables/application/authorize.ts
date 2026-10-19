import { ModulePolicy } from '../../tenancy';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { DomainError, Result } from '@mini-market/shared-kernel';

/**
 * First line of a receivables use case: the permission, then the `credit_sales` module flag
 * (ADR 0006). Someone without the permission is told so whatever the flag says.
 */
export function authorize(ctx: TenantContext, permission: string): Result<void, DomainError> {
  const allowed = requirePermission(ctx, permission);
  if (!allowed.ok) return allowed;
  return ModulePolicy.require(ctx, 'credit_sales');
}
