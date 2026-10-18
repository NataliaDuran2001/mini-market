import { redirect } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/api-error';
import type { ApiClient } from '@/lib/api/client';
import type { AuthGateway, AuthSession } from '@/lib/auth/auth-gateway';
import type { TenantStore } from '@/lib/auth/tenant-store';
import { myTenantsQueryOptions } from './api/my-tenants';
import { can, type Role } from './domain/role-permissions';

/** What the route guards need from the router context (the app provides it). */
export interface GuardContext {
  readonly gateway: AuthGateway;
  readonly tenantStore: TenantStore;
  readonly queryClient: QueryClient;
  readonly apiClient: ApiClient;
}

export interface GuardArgs {
  readonly context: GuardContext;
  readonly location: { readonly href: string };
}

export interface AuthenticatedRoute {
  readonly session: AuthSession;
  readonly role: Role;
  readonly tenantId: string;
}

function toLogin(args: GuardArgs) {
  return redirect({ to: '/login', search: { redirect: args.location.href } });
}

/** Signed in, no business needed yet (the tenant picker itself). */
export async function requireSession(args: GuardArgs): Promise<AuthSession> {
  const session = await args.context.gateway.getSession();
  if (!session) throw toLogin(args);
  return session;
}

/**
 * Signed in and working in a business: one business is selected automatically, several send the
 * person to `/select-tenant`, none leaves them on the picker's empty state.
 */
export async function requireAuth(args: GuardArgs): Promise<AuthenticatedRoute> {
  const session = await requireSession(args);
  const { tenantStore, queryClient, apiClient } = args.context;
  const tenants = await queryClient
    .ensureQueryData(myTenantsQueryOptions(apiClient))
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) throw toLogin(args);
      throw error;
    });

  const stored = tenantStore.get();
  const current =
    tenants.items.find((tenant) => tenant.tenantId === stored) ??
    (tenants.items.length === 1 ? tenants.items[0] : undefined);
  if (!current) {
    tenantStore.clear();
    throw redirect({ to: '/select-tenant' });
  }
  tenantStore.set(current.tenantId);
  return { session, role: current.role, tenantId: current.tenantId };
}

/**
 * Route guard for a permission such as `reports.read`. Someone without it sees the Spanish
 * "sin permiso" page. The API enforces the permission again on every call.
 */
export function requirePermission(permission: string) {
  return async (args: GuardArgs): Promise<AuthenticatedRoute> => {
    const route = await requireAuth(args);
    if (!can(route.role, permission)) throw redirect({ to: '/forbidden' });
    return route;
  };
}
