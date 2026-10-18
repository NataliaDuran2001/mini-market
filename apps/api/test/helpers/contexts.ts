import { ACCESS_PERMISSIONS, TenantContext, grantedPermissions } from '../../src/modules/access';
import type { PermissionDefinitions } from '../../src/modules/access';
import { applySettingsPatch, presetFor } from '../../src/modules/tenancy';
import type { TenantSettingsPatch, Vertical } from '../../src/modules/tenancy';

/** Default users of `asOwner` and `asEmployee`: real UUIDs, because RLS casts `app.user_id`. */
export const OWNER_USER_ID = '00000000-0000-0000-0000-0000000000f1';
export const EMPLOYEE_USER_ID = '00000000-0000-0000-0000-0000000000f2';

export interface ContextOptions {
  readonly userId?: string;
  readonly vertical?: Vertical;
  /** Overrides on top of the vertical preset, for example `{ employeeCanVoid: true }`. */
  readonly settings?: TenantSettingsPatch;
  /**
   * Permissions of the module under test, for example `SALES_PERMISSIONS`. The permissions of the
   * access module are always included.
   */
  readonly permissions?: PermissionDefinitions;
}

function aContext(
  role: 'owner' | 'employee',
  tenantId: string,
  options: ContextOptions,
): TenantContext {
  const settings = applySettingsPatch(
    presetFor(options.vertical ?? 'minimarket'),
    options.settings ?? {},
  );
  return new TenantContext({
    tenantId,
    userId: options.userId ?? (role === 'owner' ? OWNER_USER_ID : EMPLOYEE_USER_ID),
    role,
    settings,
    permissions: grantedPermissions(
      { ...ACCESS_PERMISSIONS, ...options.permissions },
      role,
      settings,
    ),
  });
}

/** An owner of `tenantId`, ready to pass to a use case. Every declared permission is granted. */
export const asOwner = (tenantId: string, options: ContextOptions = {}): TenantContext =>
  aContext('owner', tenantId, options);

/** An employee of `tenantId`: holds only what each permission grants employees under the settings. */
export const asEmployee = (tenantId: string, options: ContextOptions = {}): TenantContext =>
  aContext('employee', tenantId, options);
