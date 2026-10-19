import {
  catalogItemSchemas,
  CATALOG_KINDS,
  listCatalogResponseSchema,
} from '@mini-market/contracts/catalog';
import { apiErrorSchema } from '@mini-market/contracts/common';
import { FixedClock } from '@mini-market/shared-kernel';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../src/infrastructure/db/database';
import type { TransactionScope } from '../../src/infrastructure/db/with-transaction';
import {
  CATALOG_PERMISSIONS,
  DrizzleCatalogRepository,
  presetCatalogsFor,
  seedPresetCatalogs,
} from '../../src/modules/catalog';
import type { CatalogKind } from '../../src/modules/catalog';
import { createCatalogItem } from '../../src/modules/catalog/application/create-catalog-item';
import { deactivateCatalogItem } from '../../src/modules/catalog/application/deactivate-catalog-item';
import { listCatalog } from '../../src/modules/catalog/application/list-catalog';
import { updateCatalogItem } from '../../src/modules/catalog/application/update-catalog-item';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';
import { asEmployee, asOwner } from '../helpers/contexts';
import { expectTenantIsolation } from '../isolation';

const clock = new FixedClock('2026-10-15T14:00:00Z');

describe('catalogs (issue #18)', () => {
  const access = useAccessApp();
  const catalogs = new DrizzleCatalogRepository();
  const server = () => access.app().getHttpServer() as Parameters<typeof request>[0];

  const deps = () => ({
    catalogs,
    clock,
    withTransaction: access.testDb().withTransaction,
  });
  const permissions = { permissions: CATALOG_PERMISSIONS };
  const owner = (tenantId = access.tenantId()) => asOwner(tenantId, permissions);
  const employee = (tenantId = access.tenantId()) => asEmployee(tenantId, permissions);

  const seed = (tenantId: string, preset: 'minimarket' | 'farmacia' | 'generic' = 'minimarket') =>
    access
      .testDb()
      .asAdmin({ tenantId, events: [] }, (tx) =>
        seedPresetCatalogs({ catalogs, clock }, tx, { tenantId, preset }),
      );

  const namesOf = async (kind: CatalogKind, tenantId = access.tenantId()) => {
    const result = await listCatalog(deps(), owner(tenantId), kind);
    if (!result.ok) throw result.error;
    return result.value.map((item) => ('name' in item ? item.name : ''));
  };

  describe('preset seeds', () => {
    it('gives a minimarket tenant its catalogs and no other tenant', async () => {
      // AC-1
      await seed(access.tenantId());
      expect(await namesOf('categories')).toEqual(['Abarrotes', 'Bebidas', 'Limpieza', 'Snacks']);
      expect(await namesOf('units')).toEqual(['Unidad', 'Paquete', 'Kilogramo']);
      expect(await namesOf('payment-methods')).toEqual([
        'Efectivo',
        'QR',
        'Transferencia',
        'Tarjeta',
        'Crédito',
      ]);
      expect(await namesOf('expense-categories')).toEqual([
        'Alquiler',
        'Luz',
        'Agua',
        'Internet',
        'Sueldos',
        'Otros',
      ]);
      for (const kind of CATALOG_KINDS) {
        expect(await namesOf(kind, access.otherTenantId()), kind).toEqual([]);
      }
    });

    it('gives a farmacia tenant its own categories and units, with the same payments and expenses', async () => {
      // AC-1
      await seed(access.tenantId(), 'farmacia');
      expect(await namesOf('categories')).toEqual([
        'Medicamentos',
        'Cuidado personal',
        'Bebés',
        'Vitaminas',
      ]);
      expect(await namesOf('units')).toEqual([
        'Comprimido',
        'Blíster',
        'Caja',
        'Frasco',
        'Mililitro',
        'Gramo',
      ]);
      expect(await namesOf('payment-methods')).toHaveLength(5);
      expect(await namesOf('expense-categories')).toHaveLength(6);
    });

    it('marks the units that allow decimals and the fixed expenses', async () => {
      await seed(access.tenantId());
      const units = await listCatalog(deps(), owner(), 'units');
      expect(units.ok && units.value.map((u) => 'allowsDecimals' in u && u.allowsDecimals)).toEqual(
        [false, false, true],
      );
      const expenses = await listCatalog(deps(), owner(), 'expense-categories');
      expect(
        expenses.ok &&
          expenses.value
            .filter((e) => 'isFixed' in e && e.isFixed)
            .map((e) => 'name' in e && e.name),
      ).toEqual(['Alquiler', 'Sueldos']);
    });

    it('adds nothing when it runs twice', async () => {
      await seed(access.tenantId());
      await seed(access.tenantId());
      expect(await namesOf('categories')).toEqual(['Abarrotes', 'Bebidas', 'Limpieza', 'Snacks']);
      expect(await namesOf('payment-methods')).toHaveLength(5);
    });

    it('seeds the generic preset with one unit and no categories', () => {
      const generic = presetCatalogsFor('generic');
      expect(generic.categories).toEqual([]);
      expect(generic.units.map((u) => u.code)).toEqual(['unidad']);
    });
  });

  describe('creating and changing items', () => {
    it('lets the owner create an item of each kind, answering 201 with the contract shape', async () => {
      // AC-2
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const bearer = await access.bearer({ sub: OWNER_ID });
      const bodies = {
        categories: { name: 'Lácteos' },
        units: { code: 'litro', name: 'Litro', allowsDecimals: true },
        'payment-methods': { code: 'gift', name: 'Vale', kind: 'transfer' },
        'expense-categories': { name: 'Seguros', isFixed: true },
      } as const;
      for (const kind of CATALOG_KINDS) {
        const response = await request(server())
          .post(`/api/v1/catalogs/${kind}`)
          .set('Authorization', bearer)
          .set('X-Tenant-Id', access.tenantId())
          .send(bodies[kind]);
        expect(response.status, kind).toBe(201);
        expect(catalogItemSchemas[kind].safeParse(response.body).success, kind).toBe(true);
      }
    });

    it('answers an employee POST with 403 FORBIDDEN naming the permission, and creates nothing', async () => {
      // AC-2
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const response = await request(server())
        .post('/api/v1/catalogs/categories')
        .set('Authorization', await access.bearer({ sub: EMPLOYEE_ID }))
        .set('X-Tenant-Id', access.tenantId())
        .send({ name: 'Lácteos' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'catalog.write' });
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
      expect(await namesOf('categories')).toEqual([]);
    });

    it('refuses the same change in the use case when a caller reaches it without the route guard', async () => {
      // AC-2 (defense in depth)
      for (const result of [
        await createCatalogItem(deps(), employee(), 'categories', { name: 'X' }),
        await updateCatalogItem(deps(), employee(), 'categories', access.tenantId(), {
          name: 'X',
        }),
        await deactivateCatalogItem(deps(), employee(), 'categories', access.tenantId()),
      ]) {
        expect(!result.ok && result.error.code).toBe('FORBIDDEN');
      }
    });

    it('rejects a duplicate name case-insensitively and a duplicate code with 409, per tenant', async () => {
      await seed(access.tenantId());
      const dupName = await createCatalogItem(deps(), owner(), 'categories', { name: 'bebidas' });
      expect(!dupName.ok && dupName.error.code).toBe('DUPLICATE_CATALOG_ITEM');
      const dupCode = await createCatalogItem(deps(), owner(), 'units', {
        code: 'kg',
        name: 'Otro kilo',
      });
      expect(!dupCode.ok && dupCode.error.code).toBe('DUPLICATE_CATALOG_ITEM');
      // the same name in another tenant is fine
      const other = await createCatalogItem(deps(), owner(access.otherTenantId()), 'categories', {
        name: 'Bebidas',
      });
      expect(other.ok).toBe(true);
    });

    it('keeps working after a duplicate: the transaction is not poisoned', async () => {
      await seed(access.tenantId());
      await access.testDb().withTransaction(owner(), async (tx: Transaction) => {
        const first = await catalogs.create(
          tx,
          access.tenantId(),
          'categories',
          {
            name: 'Bebidas',
            sortOrder: 9,
          },
          clock.now(),
        );
        expect(first.ok).toBe(false);
        const second = await catalogs.create(
          tx,
          access.tenantId(),
          'categories',
          {
            name: 'Frutas',
            sortOrder: 9,
          },
          clock.now(),
        );
        expect(second.ok).toBe(true);
      });
    });

    it('rejects invalid input with a field level VALIDATION_ERROR and an unknown catalog with 404', async () => {
      const blank = await createCatalogItem(deps(), owner(), 'categories', { name: '  ' });
      expect(!blank.ok && blank.error.code).toBe('VALIDATION_ERROR');
      const extra = await createCatalogItem(deps(), owner(), 'categories', {
        name: 'X',
        tenantId: access.otherTenantId(),
      });
      expect(!extra.ok && extra.error.code).toBe('VALIDATION_ERROR');
      const unknown = await createCatalogItem(deps(), owner(), 'products', { name: 'X' });
      expect(!unknown.ok && unknown.error.code).toBe('NOT_FOUND');
      const badId = await updateCatalogItem(deps(), owner(), 'categories', 'nope', { name: 'X' });
      expect(!badId.ok && badId.error.code).toBe('NOT_FOUND');
    });

    it('does not let an owner change an item of another tenant by its id', async () => {
      await seed(access.otherTenantId());
      const foreign = await listCatalog(deps(), owner(access.otherTenantId()), 'categories');
      const id = foreign.ok ? (foreign.value[0]?.id ?? '') : '';
      const result = await updateCatalogItem(deps(), owner(), 'categories', id, { name: 'Robo' });
      expect(!result.ok && result.error.code).toBe('NOT_FOUND');
      expect(await namesOf('categories', access.otherTenantId())).toContain('Abarrotes');
    });

    it('refuses a credit payment method while credit_sales is off', async () => {
      const off = asOwner(access.tenantId(), {
        ...permissions,
        settings: { modules: { credit_sales: false } },
      });
      const result = await createCatalogItem(deps(), off, 'payment-methods', {
        code: 'fiado',
        name: 'Fiado',
        kind: 'credit',
      });
      expect(!result.ok && result.error.code).toBe('MODULE_DISABLED');
    });
  });

  describe('retiring items', () => {
    it('hides a deactivated category from pickers, keeps it in the full list and offers no delete', async () => {
      // AC-3 (the products that keep their category are proven in the products suite, issue #19)
      await seed(access.tenantId());
      const all = await listCatalog(deps(), owner(), 'categories');
      const target = all.ok ? all.value[1] : undefined;
      expect(target?.id).toBeDefined();

      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const bearer = await access.bearer({ sub: OWNER_ID });
      const patched = await request(server())
        .patch(`/api/v1/catalogs/categories/${target?.id}`)
        .set('Authorization', bearer)
        .set('X-Tenant-Id', access.tenantId())
        .send({ isActive: false });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ name: 'Bebidas', isActive: false });

      const pickers = await request(server())
        .get('/api/v1/catalogs/categories?activeOnly=true')
        .set('Authorization', bearer)
        .set('X-Tenant-Id', access.tenantId());
      expect(pickers.body.items.map((item: { name: string }) => item.name)).toEqual([
        'Abarrotes',
        'Limpieza',
        'Snacks',
      ]);
      expect(await namesOf('categories')).toContain('Bebidas');

      const deleted = await request(server())
        .delete(`/api/v1/catalogs/categories/${target?.id}`)
        .set('Authorization', bearer)
        .set('X-Tenant-Id', access.tenantId());
      expect(deleted.status).toBe(404);
      expect(await namesOf('categories')).toContain('Bebidas');
    });

    it('reactivates an item and deactivates through the dedicated use case', async () => {
      await seed(access.tenantId());
      const all = await listCatalog(deps(), owner(), 'units');
      const id = all.ok ? (all.value[0]?.id ?? '') : '';
      const off = await deactivateCatalogItem(deps(), owner(), 'units', id);
      expect(off.ok && off.value.isActive).toBe(false);
      const on = await updateCatalogItem(deps(), owner(), 'units', id, { isActive: true });
      expect(on.ok && on.value.isActive).toBe(true);
    });
  });

  describe('listing', () => {
    it('leaves the credit payment method out while credit_sales is off, for every role', async () => {
      // AC-4
      await seed(access.tenantId());
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const list = async (userId: string) =>
        request(server())
          .get('/api/v1/catalogs/payment-methods')
          .set('Authorization', await access.bearer({ sub: userId }))
          .set('X-Tenant-Id', access.tenantId());
      const codes = (body: { items: { code: string }[] }) => body.items.map((item) => item.code);

      expect(codes((await list(EMPLOYEE_ID)).body)).toContain('credit');
      const off = await request(server())
        .patch('/api/v1/tenant/settings')
        .set('Authorization', await access.bearer({ sub: OWNER_ID }))
        .set('X-Tenant-Id', access.tenantId())
        .send({ modules: { credit_sales: false } });
      expect(off.status).toBe(200);
      for (const userId of [OWNER_ID, EMPLOYEE_ID]) {
        const response = await list(userId);
        expect(codes(response.body)).toEqual(['cash', 'qr', 'transfer', 'card']);
        expect(listCatalogResponseSchema.safeParse(response.body).success).toBe(true);
      }
    });

    it('lets an employee read the pickers but not the expense categories', async () => {
      await seed(access.tenantId());
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const bearer = await access.bearer({ sub: EMPLOYEE_ID });
      for (const kind of ['categories', 'units', 'payment-methods'] as const) {
        const response = await request(server())
          .get(`/api/v1/catalogs/${kind}`)
          .set('Authorization', bearer)
          .set('X-Tenant-Id', access.tenantId());
        expect(response.status, kind).toBe(200);
        expect(listCatalogResponseSchema.safeParse(response.body).success, kind).toBe(true);
      }
      const expenses = await request(server())
        .get('/api/v1/catalogs/expense-categories')
        .set('Authorization', bearer)
        .set('X-Tenant-Id', access.tenantId());
      expect(expenses.status).toBe(403);
      expect(expenses.body).toMatchObject({ permission: 'catalog.read_expense_categories' });
    });

    it('answers 404 for a catalog that does not exist and 400 for a bad query', async () => {
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const bearer = await access.bearer({ sub: OWNER_ID });
      const call = (path: string) =>
        request(server())
          .get(path)
          .set('Authorization', bearer)
          .set('X-Tenant-Id', access.tenantId());
      expect((await call('/api/v1/catalogs/colors')).status).toBe(404);
      expect((await call('/api/v1/catalogs/categories?activeOnly=maybe')).status).toBe(400);
    });
  });

  describe('tenant isolation', () => {
    const scopeFor = (
      tenantId: string | undefined,
      fallback: string,
    ): [TransactionScope | null, string] => [
      tenantId ? { tenantId, events: [] } : null,
      tenantId ?? fallback,
    ];

    for (const kind of CATALOG_KINDS) {
      it(`keeps ${kind} of tenant A away from tenant B, even when the call names A on purpose`, async () => {
        // AC-5
        const [tenantA, tenantB] = [access.tenantId(), access.otherTenantId()];
        const list = async (scope: TransactionScope | null) => {
          const [bound, target] = scopeFor(scope?.tenantId, tenantA);
          const items = await access
            .testDb()
            .withTransaction(bound, (tx) =>
              catalogs.list(tx, target, kind, { activeOnly: false, excludePaymentKinds: [] }),
            );
          return items.map(() => ({ tenantId: target }));
        };
        await expectTenantIsolation<{ tenantId: string }>({
          tenantA,
          tenantB,
          seed: (tenantId) => seed(tenantId),
          list,
        });
        // tenant B's scope asking for A's rows by A's id sees nothing
        const crossed = await access
          .testDb()
          .withTransaction({ tenantId: tenantB, events: [] }, (tx) =>
            catalogs.list(tx, tenantA, kind, { activeOnly: false, excludePaymentKinds: [] }),
          );
        expect(crossed).toEqual([]);
      });
    }

    it('rejects a write for another tenant at the database', async () => {
      await expect(
        access
          .testDb()
          .withTransaction({ tenantId: access.tenantId(), events: [] }, (tx) =>
            catalogs.create(
              tx,
              access.otherTenantId(),
              'categories',
              { name: 'X', sortOrder: 0 },
              clock.now(),
            ),
          ),
      ).rejects.toThrow();
    });
  });
});
