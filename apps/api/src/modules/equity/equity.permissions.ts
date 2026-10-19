import type { PermissionDefinitions } from '../access';

/**
 * Capital is owner only (docs/01-domain.md section 4): no employee grant, and the registry test
 * fails if one is ever added to a permission on capital or equity.
 */
export const EQUITY_PERMISSIONS = {
  'equity.read': { owner: true, employee: false },
  'equity.record': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
