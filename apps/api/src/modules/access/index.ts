// Public API of the access module. Other modules import only from here.
export { ACCESS_PERMISSIONS, permissionsProvider } from './access.permissions';
export { AccessModule } from './access.module';
export { AUDIT_PORT } from './application/ports/audit.port';
export type { AuditPort } from './application/ports/audit.port';
export {
  PERMISSION_REGISTRY,
  PermissionRegistry,
  registerPermissions,
} from './application/permission-registry';
export { PUBLIC_ROUTE_KEY } from './application/request-identity';
export type { AuthenticatedRequest } from './application/request-identity';
export { requirePermission } from './application/require-permission';
export type { AuditEntry } from './domain/audit';
export { InvitationNotFoundError, NotAMemberError } from './domain/errors';
export type { AuthenticatedUser, Role } from './domain/identity';
export { grantedPermissions, isGranted } from './domain/permissions';
export type {
  EmployeeGrant,
  PermissionDefinition,
  PermissionDefinitions,
  PermissionName,
  PermissionSettings,
} from './domain/permissions';
export { TenantContext } from './domain/tenant-context';
export { CurrentUser } from './presentation/current-user.decorator';
export { Public } from './presentation/public.decorator';
export { Ctx, RequirePermission, WithoutTenant } from './presentation/route-decorators';
export { createOwnerProvisioning } from './provisioning';
export type { OwnerProvisioning } from './provisioning';
export type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
  SupabaseUserDirectory,
  SupabaseUserRef,
} from './application/ports/supabase-admin.port';
export { SupabaseAdminClient } from './infrastructure/supabase-admin.client';
