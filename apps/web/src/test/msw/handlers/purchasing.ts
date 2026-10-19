import {
  createSupplierRequestSchema,
  updateSupplierRequestSchema,
  type ListSuppliersResponse,
  type Supplier,
} from '@mini-market/contracts/purchasing';
import { http, HttpResponse, type RequestHandler } from 'msw';
import { apiUrl } from '../api-url';

let nextId = 1;

/** A valid supplier of the contract; typed with `Supplier`, so a contract change breaks the mocks. */
export function aSupplier(overrides: Partial<Supplier> = {}): Supplier {
  const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  return {
    id,
    name: `Proveedor ${id.slice(-4)}`,
    phone: null,
    email: null,
    taxId: null,
    notes: null,
    active: true,
    ...overrides,
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * In-memory suppliers backend with the rules of the real one (unique name ignoring case, filters,
 * patch of details or active). `suppliers` is the live list, so a test can read what was saved.
 */
export function suppliersApi(initial: readonly Supplier[] = []) {
  const suppliers: Supplier[] = [...initial];
  const handlers: RequestHandler[] = [
    http.get(apiUrl('/suppliers'), ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get('q')?.toLowerCase();
      const active = url.searchParams.get('active');
      const items = suppliers
        .filter((supplier) => (active === null ? true : supplier.active === (active === 'true')))
        .filter((supplier) => !q || supplier.name.toLowerCase().includes(q));
      return HttpResponse.json({ items } satisfies ListSuppliersResponse);
    }),
    http.post(apiUrl('/suppliers'), async ({ request }) => {
      const body = createSupplierRequestSchema.parse(await request.json());
      if (suppliers.some((supplier) => sameName(supplier.name, body.name))) {
        return HttpResponse.json(
          { code: 'SUPPLIER_NAME_TAKEN', message: 'A supplier with this name already exists' },
          { status: 409 },
        );
      }
      const created = aSupplier({
        name: body.name,
        phone: body.phone ?? null,
        email: body.email ?? null,
        taxId: body.taxId ?? null,
        notes: body.notes ?? null,
      });
      suppliers.push(created);
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(apiUrl('/suppliers/:id'), async ({ request, params }) => {
      const body = updateSupplierRequestSchema.parse(await request.json());
      const index = suppliers.findIndex((supplier) => supplier.id === params['id']);
      const current = suppliers[index];
      if (!current) return HttpResponse.json({ code: 'SUPPLIER_NOT_FOUND' }, { status: 404 });
      const clash = suppliers.some(
        (other) => other.id !== current.id && body.name && sameName(other.name, body.name),
      );
      if (clash) return HttpResponse.json({ code: 'SUPPLIER_NAME_TAKEN' }, { status: 409 });
      const updated: Supplier = {
        ...current,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.taxId !== undefined ? { taxId: body.taxId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      };
      suppliers[index] = updated;
      return HttpResponse.json(updated);
    }),
  ];
  return { suppliers, handlers };
}

// Default: a business without suppliers. Tests install `suppliersApi(...)` with server.use(...).
export const handlers: RequestHandler[] = [
  http.get(apiUrl('/suppliers'), () => HttpResponse.json({ items: [] })),
];
