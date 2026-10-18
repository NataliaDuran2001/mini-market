import { useCurrentTenant } from '@/lib/auth/session';
import { useTenant } from '@/features/tenancy';
import { useMyTenants } from '../api/my-tenants';
import { can, type Role } from '../domain/role-permissions';

/** Role of the person in the business they are working in; null while it is not known. */
export function useCurrentRole(): Role | null {
  const { tenantId } = useCurrentTenant();
  const tenants = useMyTenants();
  return tenants.data?.items.find((tenant) => tenant.tenantId === tenantId)?.role ?? null;
}

/**
 * Returns `can(permission)` for the current person and business: role plus the tenant settings
 * the matrix depends on (`employeeCanVoid`). Role-aware rendering hides UI; it never authorizes
 * (docs/04-coding-standards.md section 7).
 */
export function usePermissionCheck(): (permission: string) => boolean {
  const role = useCurrentRole();
  const tenant = useTenant();
  const employeeCanVoid = tenant.data?.settings.employeeCanVoid ?? false;
  return (permission) => can(role, permission, { employeeCanVoid });
}

export function useCan(permission: string): boolean {
  return usePermissionCheck()(permission);
}
