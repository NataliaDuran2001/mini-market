// Catalog entities (docs/01-domain.md section 3, ADR 0007). Pure TypeScript.
// The wire shapes live in @mini-market/contracts/catalog; the application layer keeps both aligned.

export const CATALOG_KINDS = [
  'categories',
  'units',
  'payment-methods',
  'expense-categories',
] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const PAYMENT_METHOD_KINDS = ['cash', 'transfer', 'qr', 'card', 'credit'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

interface CatalogRow {
  readonly id: string;
  readonly isActive: boolean;
  readonly sortOrder: number;
}

export interface Category extends CatalogRow {
  readonly name: string;
}

export interface Unit extends CatalogRow {
  readonly code: string;
  readonly name: string;
  /** Whether quantities in this unit may have decimals (kg yes, unidad no). */
  readonly allowsDecimals: boolean;
}

export interface PaymentMethod extends CatalogRow {
  readonly code: string;
  readonly name: string;
  readonly kind: PaymentMethodKind;
}

export interface ExpenseCategory extends CatalogRow {
  readonly name: string;
  /** Fixed monthly cost (rent) as opposed to a variable one. */
  readonly isFixed: boolean;
}

/** What each kind stores, by kind. */
export interface CatalogItemMap {
  readonly categories: Category;
  readonly units: Unit;
  readonly 'payment-methods': PaymentMethod;
  readonly 'expense-categories': ExpenseCategory;
}

export type CatalogItem = CatalogItemMap[CatalogKind];

export interface NewCatalogItemMap {
  readonly categories: { readonly name: string; readonly sortOrder: number };
  readonly units: {
    readonly code: string;
    readonly name: string;
    readonly allowsDecimals: boolean;
    readonly sortOrder: number;
  };
  readonly 'payment-methods': {
    readonly code: string;
    readonly name: string;
    readonly kind: PaymentMethodKind;
    readonly sortOrder: number;
  };
  readonly 'expense-categories': {
    readonly name: string;
    readonly isFixed: boolean;
    readonly sortOrder: number;
  };
}

/** Some of the fields of T; a key left out (or undefined) keeps its stored value. */
type PatchOf<T> = { readonly [P in keyof T]?: T[P] | undefined };

/** Fields an update may change. `code` and the payment method `kind` never change. */
export interface CatalogPatchMap {
  readonly categories: PatchOf<Pick<Category, 'name' | 'sortOrder' | 'isActive'>>;
  readonly units: PatchOf<Pick<Unit, 'name' | 'allowsDecimals' | 'sortOrder' | 'isActive'>>;
  readonly 'payment-methods': PatchOf<Pick<PaymentMethod, 'name' | 'sortOrder' | 'isActive'>>;
  readonly 'expense-categories': PatchOf<
    Pick<ExpenseCategory, 'name' | 'isFixed' | 'sortOrder' | 'isActive'>
  >;
}

export function isCatalogKind(value: string): value is CatalogKind {
  return (CATALOG_KINDS as readonly string[]).includes(value);
}

/**
 * Permission that lists a kind. Expense categories belong to the expenses area, which employees
 * never see (docs/01-domain.md section 4); the other three feed the sale screen.
 */
export function readPermissionFor(kind: CatalogKind): string {
  return kind === 'expense-categories' ? 'catalog.read_expense_categories' : 'catalog.read';
}

export const WRITE_PERMISSION = 'catalog.write';
