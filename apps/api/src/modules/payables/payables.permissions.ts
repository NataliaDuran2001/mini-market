import type { PermissionDefinitions } from '../access';

/**
 * Payables permissions (docs/01-domain.md section 4): expenses and payables are the owner's. The
 * name contains "expenses", so the registry test fails the build if an employee is ever granted it.
 */
export const PAYABLES_PERMISSIONS = {
  /** Create, edit and pay expenses, manage recurring templates, view the expenses of a period. */
  'expenses.manage': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
