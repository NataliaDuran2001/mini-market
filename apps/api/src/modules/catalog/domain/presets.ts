// Starting catalogs per vertical preset (ADR 0006, ADR 0007, issue #18). The values are tenant
// data in the language of the business, not UI strings. After provisioning the owner edits them.
import type { Vertical } from '../../tenancy';
import type { NewCatalogItemMap } from './catalog-item';

export type PresetCatalogs = {
  readonly [K in keyof NewCatalogItemMap]: readonly NewCatalogItemMap[K][];
};

/** Items are listed in display order: `sortOrder` is their index. */
const categories = (...names: string[]): NewCatalogItemMap['categories'][] =>
  names.map((name, sortOrder) => ({ name, sortOrder }));

const unit = (
  code: string,
  name: string,
  allowsDecimals: boolean,
): Omit<NewCatalogItemMap['units'], 'sortOrder'> => ({ code, name, allowsDecimals });

const units = (
  ...items: Omit<NewCatalogItemMap['units'], 'sortOrder'>[]
): NewCatalogItemMap['units'][] => items.map((item, sortOrder) => ({ ...item, sortOrder }));

const PAYMENT_METHODS: PresetCatalogs['payment-methods'] = [
  { code: 'cash', name: 'Efectivo', kind: 'cash', sortOrder: 0 },
  { code: 'qr', name: 'QR', kind: 'qr', sortOrder: 1 },
  { code: 'transfer', name: 'Transferencia', kind: 'transfer', sortOrder: 2 },
  { code: 'card', name: 'Tarjeta', kind: 'card', sortOrder: 3 },
  { code: 'credit', name: 'Crédito', kind: 'credit', sortOrder: 4 },
];

const FIXED = new Set(['Alquiler', 'Sueldos']);
const EXPENSE_CATEGORIES: PresetCatalogs['expense-categories'] = [
  'Alquiler',
  'Luz',
  'Agua',
  'Internet',
  'Sueldos',
  'Otros',
].map((name, sortOrder) => ({ name, isFixed: FIXED.has(name), sortOrder }));

const PRESET_CATALOGS: { readonly [V in Vertical]: PresetCatalogs } = {
  minimarket: {
    categories: categories('Abarrotes', 'Bebidas', 'Limpieza', 'Snacks'),
    units: units(
      unit('unidad', 'Unidad', false),
      unit('paquete', 'Paquete', false),
      unit('kg', 'Kilogramo', true),
    ),
    'payment-methods': PAYMENT_METHODS,
    'expense-categories': EXPENSE_CATEGORIES,
  },
  farmacia: {
    categories: categories('Medicamentos', 'Cuidado personal', 'Bebés', 'Vitaminas'),
    units: units(
      unit('comprimido', 'Comprimido', false),
      unit('blister', 'Blíster', false),
      unit('caja', 'Caja', false),
      unit('frasco', 'Frasco', false),
      unit('ml', 'Mililitro', true),
      unit('g', 'Gramo', true),
    ),
    'payment-methods': PAYMENT_METHODS,
    'expense-categories': EXPENSE_CATEGORIES,
  },
  // Starting point for other verticals: no categories, one unit, the common payments and expenses.
  generic: {
    categories: [],
    units: units(unit('unidad', 'Unidad', false)),
    'payment-methods': PAYMENT_METHODS,
    'expense-categories': EXPENSE_CATEGORIES,
  },
};

/** The catalogs that provisioning seeds for `vertical`. */
export function presetCatalogsFor(vertical: Vertical): PresetCatalogs {
  return PRESET_CATALOGS[vertical];
}
