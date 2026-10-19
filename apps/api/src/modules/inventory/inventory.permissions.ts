import type { PermissionDefinitions } from '../access';

/**
 * Permissions of the inventory module (docs/01-domain.md section 4): everybody sees stock levels,
 * only the owner corrects stock or opens it. The cost of a movement needs `costs.read`, which the
 * catalog module declares.
 */
export const INVENTORY_PERMISSIONS = {
  'inventory.read': { owner: true, employee: true },
  'inventory.adjust': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
