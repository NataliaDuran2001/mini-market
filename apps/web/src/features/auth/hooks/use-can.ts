import { useCurrentTenant } from '@/lib/auth/session';
import { useMyTenants } from '../api/my-tenants';
import { can, type Role } from '../domain/role-permissions';

/** Role of the person in the business they are working in; null while it is not known. */
export function useCurrentRole(): Role | null {
  const { tenantId } = useCurrentTenant();
  const tenants = useMyTenants();
  return tenants.data?.items.find((tenant) => tenant.tenantId === tenantId)?.role ?? null;
}

/**
 * Role-aware rendering (docs/04-coding-standards.md section 7). It hides UI; it never authorizes.
 */
export function useCan(permission: string): boolean {
  return can(useCurrentRole(), permission);
}
