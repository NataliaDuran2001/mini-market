// Convenience mirror of the permission matrix (docs/01-domain.md section 4) used only to hide or
// show UI. The API enforces permissions in its use cases and answers 403 regardless of what this
// says (docs/05-security.md). `GET /me/tenants` returns the role, not the permission list, so the
// UI derives what it needs from the role.
//
// Fail closed: the owner holds everything; an employee holds only what is listed here. A new
// permission is hidden from employees until it is added, never shown by mistake.
import type { MyTenant } from '@mini-market/contracts/access';

export type Role = MyTenant['role'];

export interface PermissionSettings {
  /** `tenant.settings.employeeCanVoid`; unknown (false) until the tenant settings are loaded. */
  readonly employeeCanVoid: boolean;
}

const EMPLOYEE_ALWAYS = new Set<string>(['sales.create', 'purchases.create']);
const EMPLOYEE_IF_CAN_VOID = new Set<string>(['sales.void']);

export function can(
  role: Role | null,
  permission: string,
  settings: PermissionSettings = { employeeCanVoid: false },
): boolean {
  if (role === 'owner') return true;
  if (role !== 'employee') return false;
  if (EMPLOYEE_ALWAYS.has(permission)) return true;
  return settings.employeeCanVoid && EMPLOYEE_IF_CAN_VOID.has(permission);
}
