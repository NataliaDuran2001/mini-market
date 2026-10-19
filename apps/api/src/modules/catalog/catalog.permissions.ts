import type { PermissionDefinitions } from '../access';

/**
 * Permissions of the catalog module (docs/01-domain.md section 4). Employees read what the sale
 * screen needs; changing catalogs is the owner's. Expense categories belong to the expenses area,
 * which employees never see, so reading them is owner only.
 */
export const CATALOG_PERMISSIONS = {
  'catalog.read': { owner: true, employee: true },
  'catalog.read_expense_categories': { owner: true, employee: false },
  'catalog.write': { owner: true, employee: false },
  'products.read': { owner: true, employee: true },
  'products.write': { owner: true, employee: false },
  /** Average cost and margin of a product. Never granted to employees. */
  'costs.read': { owner: true, employee: false },
} as const satisfies PermissionDefinitions;
