// Permission matrix building blocks (docs/01-domain.md section 4). There is no shared matrix file:
// each module declares its own permissions in `<domain>.permissions.ts` and registers them at
// module init through `permissionsProvider` (parallel-lane convention of issue #11).
import type { Role } from './identity';

/** The part of the tenant settings a permission may depend on. */
export interface PermissionSettings {
  readonly employeeCanVoid: boolean;
}

/** `<area>.<action>`, lower case: `sales.void`, `reports.read`, `members.manage`. */
export type PermissionName = string;

const PERMISSION_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export const isValidPermissionName = (name: string): boolean => PERMISSION_NAME.test(name);

/** An employee may hold a permission always, never, or depending on the tenant settings. */
export type EmployeeGrant = boolean | ((settings: PermissionSettings) => boolean);

/** The owner and employee grants sit next to each permission. */
export interface PermissionDefinition {
  readonly owner: true;
  readonly employee: EmployeeGrant;
}

export type PermissionDefinitions = Readonly<Record<PermissionName, PermissionDefinition>>;

export function isGranted(
  definition: PermissionDefinition,
  role: Role,
  settings: PermissionSettings,
): boolean {
  if (role === 'owner') return true;
  return typeof definition.employee === 'function'
    ? definition.employee(settings)
    : definition.employee;
}

/** Names of the permissions a role holds under the given settings, sorted. */
export function grantedPermissions(
  definitions: PermissionDefinitions,
  role: Role,
  settings: PermissionSettings,
): readonly PermissionName[] {
  return Object.entries(definitions)
    .filter(([, definition]) => isGranted(definition, role, settings))
    .map(([name]) => name)
    .sort();
}
