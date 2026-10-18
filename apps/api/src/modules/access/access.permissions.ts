import type { Provider } from '@nestjs/common';
import { PERMISSION_REGISTRY, registerPermissions } from './application/permission-registry';
import type { PermissionRegistry } from './application/permission-registry';
import type { PermissionDefinitions } from './domain/permissions';

/**
 * Permissions of the access module, plus the ones of modules that sit below it in the dependency
 * graph and therefore cannot register their own: the tenancy use case that changes settings asks
 * `ctx.can("settings.write")`. Permissions of tenancy (provisioning, #13) are added here; do not
 * declare these names in another module, the application would refuse to start ("declared by
 * both").
 */
export const ACCESS_PERMISSIONS = {
  'members.manage': { owner: true, employee: false },
  'settings.write': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;

/**
 * How a module registers its permissions at module init: declare them in
 * `<domain>.permissions.ts` and add `permissionsProvider('sales', SALES_PERMISSIONS)` to the
 * `providers` of its Nest module. Nest builds the provider while the application starts, before
 * the first request is served.
 */
export function permissionsProvider(
  moduleName: string,
  definitions: PermissionDefinitions,
): Provider {
  return {
    provide: Symbol(`PERMISSIONS:${moduleName}`),
    useFactory: (registry: PermissionRegistry) => {
      registerPermissions(registry, moduleName, definitions);
      return definitions;
    },
    inject: [PERMISSION_REGISTRY],
  };
}
