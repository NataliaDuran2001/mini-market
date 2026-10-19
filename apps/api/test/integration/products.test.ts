import {
  productEmployeeSchema,
  productOwnerSchema,
  searchProductsResponseSchema,
} from '@mini-market/contracts/catalog';
import { apiErrorSchema } from '@mini-market/contracts/common';
import { FixedClock, Money, Quantity } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_PERMISSIONS,
  DrizzleCatalogRepository,
  DrizzleProductRepository,
  productPresentations,
  products,
} from '../../src/modules/catalog';
import { createProduct } from '../../src/modules/catalog/application/create-product';
import { getProduct } from '../../src/modules/catalog/application/get-product';
import { listCatalog } from '../../src/modules/catalog/application/list-catalog';
import { searchProducts } from '../../src/modules/catalog/application/search-products';
import { setProductActive } from '../../src/modules/catalog/application/set-product-active';
import { updateCatalogItem } from '../../src/modules/catalog/application/update-catalog-item';
import { updateProduct } from '../../src/modules/catalog/application/update-product';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { catalogSeeders, seedCatalogs } from '../../src/modules/tenancy';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';
import { asEmployee, asOwner } from '../helpers/contexts';
import { expectTenantIsolation } from '../isolation';

const clock = new FixedClock('2026-10-15T14:00:00Z');

describe('products (issue #19)', () => {
  const access = useAccessApp();
  const repository = new DrizzleProductRepository();
  const server = () => access.app().getHttpServer() as Parameters<typeof request>[0];

  const deps = () => ({
    products: repository,
    audit: new DrizzleAuditRepository(),
    clock,
    withTransaction: access.testDb().withTransaction,
  });
  const permissions = { permissions: CATALOG_PERMISSIONS };
  const owner = (tenantId = access.tenantId()) => asOwner(tenantId, permissions);
  const employee = (tenantId = access.tenantId()) => asEmployee(tenantId, permissions);

  /** Seeds the preset catalogs of a tenant and returns ids to build products with. */
  const refsOf = async (tenantId = access.tenantId()) => {
    await seedCatalogs(
      { withTransaction: access.testDb().asAdmin, seeders: catalogSeeders },
      { tenantId, preset: 'minimarket' },
    );
    const lists = async (kind: 'categories' | 'units') => {
      const result = await listCatalog(
        {
          catalogs: new DrizzleCatalogRepository(),
          withTransaction: access.testDb().withTransaction,
        },
        owner(tenantId),
        kind,
      );
      if (!result.ok) throw result.error;
      return result.value;
    };
    const [category] = await lists('categories');
    const [unit] = await lists('units');
    return { categoryId: category?.id ?? '', baseUnitId: unit?.id ?? '' };
  };

  const create = async (
    refs: { categoryId: string; baseUnitId: string },
    input: { name: string; code?: string | null; salePrice?: number; minStock?: string },
    tenantId = access.tenantId(),
  ) =>
    createProduct(deps(), owner(tenantId), {
      name: input.name,
      code: input.code ?? null,
      categoryId: refs.categoryId,
      baseUnitId: refs.baseUnitId,
      salePrice: input.salePrice ?? 1250,
      minStock: input.minStock ?? '0.000',
    });

  const setAvgCost = (productId: string, centavos: number) =>
    access
      .testDb()
      .client.query('update products set avg_cost_centavos = $1 where id = $2', [
        centavos,
        productId,
      ]);

  describe('creating', () => {
    it('creates the product and a default presentation with factor 1 and the same price', async () => {
      // AC-1
      const refs = await refsOf();
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const response = await request(server())
        .post('/api/v1/products')
        .set('Authorization', await access.bearer({ sub: OWNER_ID }))
        .set('X-Tenant-Id', access.tenantId())
        .send({ name: 'Coca Cola 2L', salePrice: 1250, ...refs });
      expect(response.status).toBe(201);
      expect(productOwnerSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        name: 'Coca Cola 2L',
        code: null,
        salePrice: 1250,
        avgCost: 0,
        margin: 1250,
        minStock: '0.000',
        isActive: true,
      });
      expect(response.body.presentations).toEqual([
        expect.objectContaining({ factor: 1, salePrice: 1250, isDefault: true }),
      ]);
    });

    it('lets only the owner create: an employee gets 403 naming the permission', async () => {
      const refs = await refsOf();
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const response = await request(server())
        .post('/api/v1/products')
        .set('Authorization', await access.bearer({ sub: EMPLOYEE_ID }))
        .set('X-Tenant-Id', access.tenantId())
        .send({ name: 'Coca Cola 2L', salePrice: 1250, ...refs });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'products.write' });
      const direct = await createProduct(deps(), employee(), {
        name: 'Y',
        code: null,
        categoryId: null,
        baseUnitId: refs.baseUnitId,
        salePrice: 100,
        minStock: '0.000',
      });
      expect(!direct.ok && direct.error.code).toBe('FORBIDDEN');
    });

    it('rejects a price that is zero, negative or not whole centavos with 400', async () => {
      const refs = await refsOf();
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const bearer = await access.bearer({ sub: OWNER_ID });
      for (const salePrice of [0, -5, 12.5, '12.50']) {
        const response = await request(server())
          .post('/api/v1/products')
          .set('Authorization', bearer)
          .set('X-Tenant-Id', access.tenantId())
          .send({ name: 'Coca', salePrice, ...refs });
        expect(response.status, String(salePrice)).toBe(400);
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
      }
    });

    it('rejects a category or unit of another tenant as a validation error, not a foreign key leak', async () => {
      const mine = await refsOf();
      const theirs = await refsOf(access.otherTenantId());
      const wrongCategory = await create(
        { categoryId: theirs.categoryId, baseUnitId: mine.baseUnitId },
        { name: 'A' },
      );
      expect(!wrongCategory.ok && wrongCategory.error.code).toBe('VALIDATION_ERROR');
      const wrongUnit = await create(
        { categoryId: mine.categoryId, baseUnitId: theirs.baseUnitId },
        { name: 'B' },
      );
      expect(!wrongUnit.ok && wrongUnit.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('codes', () => {
    it('answers 409 DUPLICATE_CODE for the same code in the tenant, in any case, and allows it in another tenant', async () => {
      // AC-4
      const refs = await refsOf();
      const theirs = await refsOf(access.otherTenantId());
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const bearer = await access.bearer({ sub: OWNER_ID });
      const post = (code: string) =>
        request(server())
          .post('/api/v1/products')
          .set('Authorization', bearer)
          .set('X-Tenant-Id', access.tenantId())
          .send({ name: `P ${code}`, salePrice: 500, code, ...refs });
      expect((await post('7790001')).status).toBe(201);
      const duplicate = await post('7790001');
      expect(duplicate.status).toBe(409);
      expect(duplicate.body).toMatchObject({ code: 'DUPLICATE_CODE' });
      expect((await post(' 7790001 ')).status).toBe(409);

      const other = await create(theirs, { name: 'Z', code: '7790001' }, access.otherTenantId());
      expect(other.ok).toBe(true);
    });

    it('keeps the transaction usable after a duplicate and treats a blank code as no code', async () => {
      const refs = await refsOf();
      await create(refs, { name: 'A', code: 'C1' });
      await access.testDb().withTransaction(owner(), async (tx) => {
        const taken = await repository.create(
          tx,
          access.tenantId(),
          {
            name: 'B',
            code: 'c1',
            categoryId: null,
            baseUnitId: refs.baseUnitId,
            salePrice: Money.fromCentavos(100),
            minStock: Quantity.zero(),
          },
          clock.now(),
        );
        expect(taken.ok).toBe(false);
        const free = await repository.create(
          tx,
          access.tenantId(),
          {
            name: 'C',
            code: null,
            categoryId: null,
            baseUnitId: refs.baseUnitId,
            salePrice: Money.fromCentavos(100),
            minStock: Quantity.zero(),
          },
          clock.now(),
        );
        expect(free.ok).toBe(true);
      });
    });
  });

  describe('searching', () => {
    const query = (q: string | undefined, extra: object = {}) => ({
      q,
      categoryId: undefined,
      activeOnly: false,
      page: 1,
      pageSize: 20,
      ...extra,
    });

    const seedMany = async (refs: { categoryId: string; baseUnitId: string }) => {
      const row = (name: string, code: string) => ({
        tenantId: access.tenantId(),
        name,
        code,
        categoryId: refs.categoryId,
        baseUnitId: refs.baseUnitId,
        salePriceCentavos: 1000n,
      });
      const rows = Array.from({ length: 1000 }, (_, index) =>
        row(`Producto ${String(index).padStart(4, '0')}`, `P${index}`),
      );
      rows.push(
        row('Agua Coca', 'AG1'),
        row('Coca Cola 500ml', 'CC5'),
        row('Coca Cola 2L', 'CC2'),
        row('Gaseosa', 'coca'),
      );
      await access.testDb().db.insert(products).values(rows);
    };

    it('finds 1,000 products by name in under 200 ms, name matches first (prefix, then contains), then the code match', async () => {
      // AC-2
      const refs = await refsOf();
      await seedMany(refs);
      const started = performance.now();
      const result = await searchProducts(deps(), owner(), query('coca'));
      const elapsed = performance.now() - started;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(elapsed).toBeLessThan(200);
      expect(result.value.items.map((item) => item.name)).toEqual([
        'Coca Cola 2L',
        'Coca Cola 500ml',
        'Agua Coca',
        'Gaseosa',
      ]);
      expect(result.value.total).toBe(4);
      expect(searchProductsResponseSchema.safeParse(result.value).success).toBe(true);
    });

    it('pages the results and filters by category and active state', async () => {
      const refs = await refsOf();
      await seedMany(refs);
      const page = await searchProducts(
        deps(),
        owner(),
        query(undefined, { pageSize: 50, page: 3 }),
      );
      expect(page.ok && page.value.items).toHaveLength(50);
      expect(page.ok && page.value.total).toBe(1004);
      const none = await searchProducts(
        deps(),
        owner(),
        query(undefined, { categoryId: access.otherTenantId() }),
      );
      expect(none.ok && none.value.total).toBe(0);
      await access
        .testDb()
        .client.query("update products set is_active = false where name = 'Gaseosa'");
      const active = await searchProducts(deps(), owner(), query('gaseosa', { activeOnly: true }));
      expect(active.ok && active.value.total).toBe(0);
    });

    it('treats % and _ in the text as characters, not wildcards', async () => {
      const refs = await refsOf();
      await create(refs, { name: 'Jugo 100% natural' });
      await create(refs, { name: 'Jugo 1000 natural' });
      const result = await searchProducts(deps(), owner(), query('100%'));
      expect(result.ok && result.value.items.map((item) => item.name)).toEqual([
        'Jugo 100% natural',
      ]);
    });
  });

  describe('what each role sees', () => {
    it('gives the employee no avgCost and no margin, anywhere, and the owner both', async () => {
      // AC-3
      const refs = await refsOf();
      const created = await create(refs, { name: 'Coca Cola 2L', code: 'CC2' });
      if (!created.ok) throw created.error;
      await setAvgCost(created.value.id, 800);
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const asUser = async (userId: string, path: string) =>
        request(server())
          .get(path)
          .set('Authorization', await access.bearer({ sub: userId }))
          .set('X-Tenant-Id', access.tenantId());

      const own = await asUser(OWNER_ID, `/api/v1/products/${created.value.id}`);
      expect(own.body).toMatchObject({ avgCost: 800, margin: 450 });
      expect(productOwnerSchema.safeParse(own.body).success).toBe(true);

      const staff = await asUser(EMPLOYEE_ID, `/api/v1/products/${created.value.id}`);
      expect(staff.status).toBe(200);
      expect(staff.body).not.toHaveProperty('avgCost');
      expect(staff.body).not.toHaveProperty('margin');
      expect(productEmployeeSchema.safeParse(staff.body).success).toBe(true);

      const list = await asUser(EMPLOYEE_ID, '/api/v1/products?q=coca');
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toMatch(/avgCost|margin/);
      expect(list.body.items[0]).not.toHaveProperty('avgCost');
    });

    it('answers 404 for an unknown or malformed id and for a product of another tenant', async () => {
      const refs = await refsOf();
      const theirs = await refsOf(access.otherTenantId());
      const foreign = await create(theirs, { name: 'Ajeno' }, access.otherTenantId());
      if (!foreign.ok) throw foreign.error;
      for (const id of [foreign.value.id, '3f2504e0-4f89-41d3-9a0c-0305e82c3399', 'nope']) {
        const result = await getProduct(deps(), owner(), id);
        expect(!result.ok && result.error.code, id).toBe('NOT_FOUND');
      }
      void refs;
    });
  });

  describe('changing', () => {
    it('writes product.price_changed with the old and the new price and updates the default presentation', async () => {
      // AC-5
      const refs = await refsOf();
      const created = await create(refs, { name: 'Coca Cola 2L', salePrice: 1250 });
      if (!created.ok) throw created.error;
      const updated = await updateProduct(deps(), owner(), created.value.id, { salePrice: 1400 });
      expect(updated.ok && updated.value.salePrice).toBe(1400);
      expect(updated.ok && updated.value.presentations[0]?.salePrice).toBe(1400);

      const { rows } = await access
        .testDb()
        .client.query<{ action: string; entity: string; before: unknown; after: unknown }>(
          "select action, entity, before, after from audit_log where action = 'product.price_changed'",
        );
      expect(rows).toEqual([
        expect.objectContaining({
          entity: 'presentation',
          before: { productId: created.value.id, salePrice: 1250 },
          after: { productId: created.value.id, salePrice: 1400 },
        }),
      ]);
    });

    it('does not audit a change that leaves the price as it was', async () => {
      const refs = await refsOf();
      const created = await create(refs, { name: 'Coca Cola 2L', salePrice: 1250 });
      if (!created.ok) throw created.error;
      await updateProduct(deps(), owner(), created.value.id, { salePrice: 1250, name: 'Coca 2L' });
      const { rows } = await access
        .testDb()
        .client.query("select 1 from audit_log where action = 'product.price_changed'");
      expect(rows).toHaveLength(0);
    });

    it('renames, recodes and moves a product, and refuses a duplicate code or an unknown id', async () => {
      const refs = await refsOf();
      const a = await create(refs, { name: 'A', code: 'A1' });
      const b = await create(refs, { name: 'B', code: 'B1' });
      if (!a.ok || !b.ok) throw new Error('setup');
      const renamed = await updateProduct(deps(), owner(), a.value.id, {
        name: 'Alfa',
        code: null,
        categoryId: null,
        minStock: '5.000',
      });
      expect(renamed.ok && renamed.value).toMatchObject({
        name: 'Alfa',
        code: null,
        categoryId: null,
        minStock: '5.000',
      });
      const taken = await updateProduct(deps(), owner(), a.value.id, { code: 'b1' });
      expect(!taken.ok && taken.error.code).toBe('DUPLICATE_CODE');
      const missing = await updateProduct(deps(), owner(), '3f2504e0-4f89-41d3-9a0c-0305e82c3399', {
        name: 'X',
      });
      expect(!missing.ok && missing.error.code).toBe('NOT_FOUND');
    });

    it('retires and reactivates a product through the route, owner only', async () => {
      const refs = await refsOf();
      const created = await create(refs, { name: 'Coca Cola 2L' });
      if (!created.ok) throw created.error;
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const toggle = async (userId: string, isActive: boolean) =>
        request(server())
          .post(`/api/v1/products/${created.value.id}/active`)
          .set('Authorization', await access.bearer({ sub: userId }))
          .set('X-Tenant-Id', access.tenantId())
          .send({ isActive });
      expect((await toggle(EMPLOYEE_ID, false)).status).toBe(403);
      const off = await toggle(OWNER_ID, false);
      expect(off.status).toBe(200);
      expect(off.body.isActive).toBe(false);
      const on = await setProductActive(deps(), owner(), created.value.id, true);
      expect(on.ok && on.value.isActive).toBe(true);
    });
  });

  describe('catalogs it depends on', () => {
    it('keeps its category and unit when the owner retires them, while pickers hide them', async () => {
      // AC-3 of #18: retiring a catalog item never breaks the products that use it
      const refs = await refsOf();
      const created = await create(refs, { name: 'Coca Cola 2L' });
      if (!created.ok) throw created.error;
      const catalogDeps = {
        catalogs: new DrizzleCatalogRepository(),
        clock,
        withTransaction: access.testDb().withTransaction,
      };
      for (const [kind, id] of [
        ['categories', refs.categoryId],
        ['units', refs.baseUnitId],
      ] as const) {
        const retired = await updateCatalogItem(catalogDeps, owner(), kind, id, {
          isActive: false,
        });
        expect(retired.ok).toBe(true);
        const pickers = await listCatalog(catalogDeps, owner(), kind, { activeOnly: true });
        expect(pickers.ok && pickers.value.some((item) => item.id === id)).toBe(false);
      }
      const reread = await getProduct(deps(), owner(), created.value.id);
      expect(reread.ok && reread.value).toMatchObject({
        categoryId: refs.categoryId,
        baseUnitId: refs.baseUnitId,
      });
    });
  });

  describe('tenant isolation', () => {
    it('keeps the products of tenant A away from tenant B', async () => {
      // AC-1..AC-5 (isolation requirement of the Definition of Done)
      const [tenantA, tenantB] = [access.tenantId(), access.otherTenantId()];
      await expectTenantIsolation<{ tenantId: string }>({
        tenantA,
        tenantB,
        seed: async (tenantId) => {
          const refs = await refsOf(tenantId);
          const made = await create(refs, { name: `P ${tenantId.slice(0, 4)}` }, tenantId);
          if (!made.ok) throw made.error;
        },
        list: async (scope) => {
          const target = scope?.tenantId ?? tenantA;
          const page = await access.testDb().withTransaction(scope, (tx) =>
            repository.search(tx, target, {
              q: undefined,
              categoryId: undefined,
              activeOnly: false,
              page: 1,
              pageSize: 50,
            }),
          );
          return page.items.map(() => ({ tenantId: target }));
        },
      });
      const crossed = await access
        .testDb()
        .withTransaction({ tenantId: tenantB, events: [] }, (tx) =>
          repository.search(tx, tenantA, {
            q: undefined,
            categoryId: undefined,
            activeOnly: false,
            page: 1,
            pageSize: 50,
          }),
        );
      expect(crossed.items).toEqual([]);
    });

    it('rejects at the database a product or presentation written for another tenant', async () => {
      const refs = await refsOf();
      const scope = { tenantId: access.tenantId(), events: [] };
      await expect(
        access.testDb().withTransaction(scope, (tx) =>
          tx.insert(products).values({
            tenantId: access.otherTenantId(),
            name: 'X',
            baseUnitId: refs.baseUnitId,
            salePriceCentavos: 100n,
          }),
        ),
      ).rejects.toThrow();
      const created = await create(refs, { name: 'Mine' });
      if (!created.ok) throw created.error;
      await expect(
        access.testDb().withTransaction(scope, (tx) =>
          tx.insert(productPresentations).values({
            tenantId: access.otherTenantId(),
            productId: created.value.id,
            name: 'X',
            factor: 1,
            salePriceCentavos: 100n,
          }),
        ),
      ).rejects.toThrow();
    });

    it('refuses at the database a product that points at a category of another tenant', async () => {
      const mine = await refsOf();
      const theirs = await refsOf(access.otherTenantId());
      await expect(
        access.testDb().db.execute(
          sql`insert into products (tenant_id, name, category_id, base_unit_id, sale_price_centavos)
              values (${access.tenantId()}, 'Cruzado', ${theirs.categoryId}, ${mine.baseUnitId}, 100)`,
        ),
      ).rejects.toThrow();
    });
  });
});
