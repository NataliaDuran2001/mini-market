import type { AuthenticatedUser } from '../domain/identity';
import type { TenantContext } from '../domain/tenant-context';

export type { AuthenticatedUser, TenantContext };

// These are HTTP details that live in `application` only because the boundary rules let the guards
// (infrastructure) and the decorators (presentation) import from there, and nothing else they
// share. They carry no framework types.

/** Route metadata set by `@Public()` and read by the JWT guard. */
export const PUBLIC_ROUTE_KEY = 'mini-market:public-route';

/** Route metadata set by `@WithoutTenant()`: the route needs a user but no `X-Tenant-Id`. */
export const WITHOUT_TENANT_KEY = 'mini-market:without-tenant';

/** Route metadata set by `@RequirePermission(name)`. */
export const REQUIRED_PERMISSION_KEY = 'mini-market:required-permission';

/** Header that names the tenant of a request (docs/04-coding-standards.md section 6). */
export const TENANT_HEADER = 'x-tenant-id';

/**
 * The JWT guard stores the verified identity on the request and the tenant guard the context;
 * `@CurrentUser()` and `@Ctx()` read them back. The property name `tenantScope` is the one the
 * tenancy controllers already read (`CurrentTenantScope`), and TenantContext satisfies its type.
 */
export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  tenantScope?: TenantContext;
}
