import type { PermissionDefinitions } from '../access';

/**
 * Purchasing permissions (docs/01-domain.md section 4). Employees register purchases and see the
 * suppliers, but only the owner creates or edits them. Cost data is never granted to employees.
 */
export const PURCHASING_PERMISSIONS = {
  /** Register purchases, and read the supplier list to pick one. */
  'purchases.create': { owner: true, employee: true },
  /** Create, edit and deactivate suppliers. */
  'suppliers.manage': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
