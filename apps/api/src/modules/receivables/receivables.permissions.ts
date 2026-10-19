import type { PermissionDefinitions } from '../access';

/**
 * Receivables permissions (docs/01-domain.md section 4). Employees sell on credit and collect, so
 * they see customers and balances and may create a customer and register a collection; only the
 * owner sets credit limits and deactivates customers.
 */
export const RECEIVABLES_PERMISSIONS = {
  /** See customers, balances and statements (also to pick a customer for a credit sale). */
  'receivables.read': { owner: true, employee: true },
  /** Create a customer, edit contact data, register a collection, charge a credit sale. */
  'receivables.collect': { owner: true, employee: true },
  /** Set or clear the credit limit and activate or deactivate customers. */
  'receivables.manage': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
