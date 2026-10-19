import {
  listMovementsResponseSchema,
  lowStockResponseSchema,
  stockMovementEmployeeSchema,
  stockMovementOwnerSchema,
} from '@mini-market/contracts/inventory';
import { FixedClock, Money, Quantity } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CATALOG_PERMISSIONS, DrizzleProductRepository } from '../../src/modules/catalog';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import {
  DrizzleStockRepository,
  INVENTORY_PERMISSIONS,
  findStockDrift,
} from '../../src/modules/inventory';
import type { NewMovement, StockBelowMinimum } from '../../src/modules/inventory';
import { adjustStock } from '../../src/modules/inventory/application/adjust-stock';
import { listLowStock } from '../../src/modules/inventory/application/list-stock';
import { recordMovements } from '../../src/modules/inventory/application/record-movements';
import { setInitialStock } from '../../src/modules/inventory/application/set-initial-stock';
import { verifyStockLevels } from '../../scripts/inventory-verify';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedProduct } from '../helpers/products';
import { expectDbError, expectTenantIsolation } from '../isolation';

const clock = new FixedClock('2026-10-15T14:00:00Z');
const q = (value: string) => Quantity.parse(value);

describe('inventory ledger (issue #20)', () => {
  const access = useAccessApp();
  const stock = new DrizzleStockRepository();
  const warnings: { data: Record<string, unknown>; message: string }[] = [];
  const server = () => access.app().getHttpServer() as Parameters<typeof request>[0];

  const deps = () => ({
    stock,
    products: new DrizzleProductRepository(),
    logger: {
      warn: (data: Record<string, unknown>, message: string) => warnings.push({ data, message }),
    },
    audit: new DrizzleAuditRepository(),
    clock,
    withTransaction: access.testDb().withTransaction,
  });
  const permissions = { permissions: { ...CATALOG_PERMISSIONS, ...INVENTORY_PERMISSIONS } };
  const owner = (options: { allowNegativeStock?: boolean } = {}, tenantId = access.tenantId()) =>
    asOwner(tenantId, { ...permissions, settings: options });
  const employee = () => asEmployee(access.tenantId(), permissions);

  const move = (ctx: ReturnType<typeof owner>, ...movements: Parameters<typeof movementOf>[0][]) =>
    access
      .testDb()
      .withTransaction(ctx, (tx) => recordMovements(deps(), ctx, tx, movements.map(movementOf)));

  const movementOf = (input: {
    productId: string;
    kind: NewMovement['kind'];
    quantity: string;
    unitCost?: number;
    reason?: string;
  }): NewMovement => ({
    productId: input.productId,
    kind: input.kind,
    quantity: q(input.quantity),
    unitCost: input.unitCost === undefined ? null : Money.fromCentavos(input.unitCost),
    reason: input.reason ?? null,
  });

  const levelOf = async (productId: string): Promise<string | undefined> => {
    const { rows } = await access
      .testDb()
      .client.query<{ quantity: string }>(
        'select quantity from stock_levels where product_id = $1',
        [productId],
      );
    return rows[0]?.quantity;
  };
  const movementCount = async (productId?: string): Promise<number> => {
    const { rows } = await access
      .testDb()
      .client.query<{ n: number }>(
        productId
          ? 'select count(*)::int as n from stock_movements where product_id = $1'
          : 'select count(*)::int as n from stock_movements',
        productId ? [productId] : [],
      );
    return rows[0]?.n ?? 0;
  };

  const withStock = async (quantity: string, options: { minStock?: string } = {}) => {
    const productId = await seedProduct(access.testDb(), access.tenantId(), options);
    const result = await move(owner(), { productId, kind: 'initial', quantity, unitCost: 500 });
    if (!result.ok) throw result.error;
    return productId;
  };

  describe('S13 negative stock', () => {
    it('rejects a movement below zero with InsufficientStock and persists nothing', async () => {
      // AC-1
      const productId = await withStock('5');
      const before = await movementCount();
      const result = await move(owner(), { productId, kind: 'sale', quantity: '-6' });
      expect(!result.ok && result.error.code).toBe('INSUFFICIENT_STOCK');
      expect(!result.ok && result.error.details).toMatchObject({
        productId,
        available: '5.000',
      });
      expect(await levelOf(productId)).toBe('5.000');
      expect(await movementCount()).toBe(before);
    });

    it('rejects the whole batch when one product of it lacks stock, changing no level', async () => {
      // AC-1
      const enough = await withStock('10');
      const lacking = await withStock('1');
      const result = await move(
        owner(),
        { productId: enough, kind: 'sale', quantity: '-2' },
        { productId: lacking, kind: 'sale', quantity: '-2' },
      );
      expect(result.ok).toBe(false);
      expect(await levelOf(enough)).toBe('10.000');
      expect(await levelOf(lacking)).toBe('1.000');
    });

    it('lets the level go below zero when the tenant allows it, and logs a warning', async () => {
      // AC-2
      const productId = await withStock('5');
      warnings.length = 0;
      const result = await move(owner({ allowNegativeStock: true }), {
        productId,
        kind: 'sale',
        quantity: '-6',
      });
      expect(result.ok).toBe(true);
      expect(await levelOf(productId)).toBe('-1.000');
      expect(warnings).toEqual([
        expect.objectContaining({
          message: 'stock level went below zero',
          data: expect.objectContaining({ productId, quantity: '-1.000' }),
        }),
      ]);
    });

    it('answers 404 for a product that does not exist or belongs to another tenant', async () => {
      const foreign = await seedProduct(access.testDb(), access.otherTenantId());
      for (const productId of [foreign, '3f2504e0-4f89-41d3-9a0c-0305e82c3399']) {
        const result = await move(owner(), { productId, kind: 'purchase', quantity: '1' });
        expect(!result.ok && result.error.code, productId).toBe('NOT_FOUND');
      }
      expect(await movementCount()).toBe(0);
    });

    it('serialises two concurrent sales of the same product: only the one that fits succeeds', async () => {
      // AC-1 (concurrency): the second transaction waits for the lock and then sees level 2
      const productId = await withStock('5');
      const results = await Promise.all([
        move(owner(), { productId, kind: 'sale', quantity: '-3' }),
        move(owner(), { productId, kind: 'sale', quantity: '-3' }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toHaveLength(1);
      expect(await levelOf(productId)).toBe('2.000');
      expect(await movementCount(productId)).toBe(2);
    });
  });

  describe('adjustments', () => {
    it('records the movement, lowers the level and writes inventory.adjusted to the audit log', async () => {
      // AC-3
      const productId = await withStock('10');
      const result = await adjustStock(deps(), owner(), {
        productId,
        delta: '-2',
        reason: 'merma',
      });
      expect(result.ok && result.value).toEqual({ productId, before: '10.000', after: '8.000' });
      expect(await levelOf(productId)).toBe('8.000');
      const { rows } = await access
        .testDb()
        .client.query(
          "select kind, quantity, reason from stock_movements where kind = 'adjustment'",
        );
      expect(rows).toEqual([{ kind: 'adjustment', quantity: '-2.000', reason: 'merma' }]);
      const audit = await access
        .testDb()
        .client.query<{ action: string; entity_id: string; before: unknown; after: unknown }>(
          "select action, entity_id, before, after from audit_log where action = 'inventory.adjusted'",
        );
      expect(audit.rows).toEqual([
        expect.objectContaining({
          entity_id: productId,
          before: { quantity: '10.000' },
          after: { quantity: '8.000', delta: '-2.000', reason: 'merma' },
        }),
      ]);
    });

    it('answers an employee with 403 on the route and in the use case, and changes nothing', async () => {
      // AC-3
      const productId = await withStock('10');
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const response = await request(server())
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', await access.bearer({ sub: EMPLOYEE_ID }))
        .set('X-Tenant-Id', access.tenantId())
        .send({ productId, delta: '-2', reason: 'merma' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'inventory.adjust' });
      const direct = await adjustStock(deps(), employee(), { productId, delta: '-2', reason: 'x' });
      expect(!direct.ok && direct.error.code).toBe('FORBIDDEN');
      expect(await levelOf(productId)).toBe('10.000');
    });

    it('works through the route for the owner and validates the body', async () => {
      const productId = await withStock('10');
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const call = async (body: object) =>
        request(server())
          .post('/api/v1/inventory/adjustments')
          .set('Authorization', await access.bearer({ sub: OWNER_ID }))
          .set('X-Tenant-Id', access.tenantId())
          .send(body);
      const ok = await call({ productId, delta: '-2', reason: 'merma' });
      expect(ok.status).toBe(201);
      expect(ok.body).toEqual({ productId, before: '10.000', after: '8.000' });
      for (const bad of [
        { productId, delta: '0', reason: 'x' },
        { productId, delta: '1.2345', reason: 'x' },
        { productId, delta: '1', reason: '  ' },
        { productId, delta: '1' },
      ]) {
        expect((await call(bad)).status, JSON.stringify(bad)).toBe(400);
      }
      const tooMuch = await call({ productId, delta: '-99', reason: 'x' });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    });
  });

  describe('StockBelowMinimum', () => {
    it('is published once, after the commit, when the level crosses the minimum', async () => {
      // AC-4
      const productId = await withStock('11', { minStock: '10' });
      const published: StockBelowMinimum[] = [];
      access.testDb().bus.subscribe('StockBelowMinimum', (event) => {
        published.push(event as StockBelowMinimum);
      });
      const ctx = owner();
      let seenInsideTransaction = -1;
      await access.testDb().withTransaction(ctx, async (tx) => {
        const result = await recordMovements(deps(), ctx, tx, [
          movementOf({ productId, kind: 'sale', quantity: '-2' }),
        ]);
        expect(result.ok).toBe(true);
        seenInsideTransaction = published.length;
      });
      expect(seenInsideTransaction).toBe(0);
      expect(published).toEqual([
        expect.objectContaining({
          type: 'StockBelowMinimum',
          tenantId: access.tenantId(),
          productId,
          quantity: '9.000',
          minStock: '10.000',
        }),
      ]);
      // already below: no second alert
      await move(owner(), { productId, kind: 'sale', quantity: '-1' });
      expect(published).toHaveLength(1);
    });

    it('is not published when the transaction rolls back or the sale is rejected', async () => {
      // AC-4
      const productId = await withStock('11', { minStock: '10' });
      const published: unknown[] = [];
      access.testDb().bus.subscribe('StockBelowMinimum', (event) => {
        published.push(event);
      });
      const ctx = owner();
      await expect(
        access.testDb().withTransaction(ctx, async (tx) => {
          await recordMovements(deps(), ctx, tx, [
            movementOf({ productId, kind: 'sale', quantity: '-2' }),
          ]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(published).toHaveLength(0);
      expect(await levelOf(productId)).toBe('11.000');
      await move(owner(), { productId, kind: 'sale', quantity: '-50' });
      expect(published).toHaveLength(0);
    });

    it('fires when the level goes below zero even without a minimum (S13)', async () => {
      const productId = await withStock('1');
      const published: unknown[] = [];
      access.testDb().bus.subscribe('StockBelowMinimum', (event) => {
        published.push(event);
      });
      await move(owner({ allowNegativeStock: true }), { productId, kind: 'sale', quantity: '-2' });
      expect(published).toHaveLength(1);
    });
  });

  describe('the ledger is append-only', () => {
    it('denies UPDATE, DELETE and TRUNCATE on stock_movements to app_user', async () => {
      // AC-5
      await withStock('5');
      for (const statement of [
        "update stock_movements set reason = 'x'",
        'delete from stock_movements',
        'truncate stock_movements',
      ]) {
        await expectDbError(
          access
            .testDb()
            .withTransaction({ tenantId: access.tenantId(), events: [] }, (tx) =>
              tx.execute(sql.raw(statement)),
            ),
          /permission denied/,
        );
      }
      expect(await movementCount()).toBe(1);
    });

    it('rejects UPDATE and DELETE even for the owner role, with the trigger', async () => {
      // AC-5 (defense in depth)
      await withStock('5');
      for (const statement of [
        "update stock_movements set reason = 'x'",
        'delete from stock_movements',
      ]) {
        await expectDbError(access.testDb().client.exec(statement), /append-only/);
      }
    });
  });

  describe('opening stock', () => {
    it('creates an initial movement, sets the average cost and refuses a second opening', async () => {
      const productId = await seedProduct(access.testDb(), access.tenantId());
      const first = await setInitialStock(deps(), owner(), {
        productId,
        quantity: '10.000',
        unitCost: 800,
      });
      expect(first.ok && first.value).toEqual({ productId, before: '0.000', after: '10.000' });
      const { rows } = await access
        .testDb()
        .client.query<{ avg: string }>(
          'select avg_cost_centavos::text as avg from products where id = $1',
          [productId],
        );
      expect(rows[0]?.avg).toBe('800');
      const second = await setInitialStock(deps(), owner(), {
        productId,
        quantity: '1',
        unitCost: 900,
      });
      expect(!second.ok && second.error.code).toBe('STOCK_ALREADY_STARTED');
      expect(await levelOf(productId)).toBe('10.000');
    });

    it('is owner only and answers 404 for an unknown product', async () => {
      const productId = await seedProduct(access.testDb(), access.tenantId());
      const denied = await setInitialStock(deps(), employee(), {
        productId,
        quantity: '1',
        unitCost: 1,
      });
      expect(!denied.ok && denied.error.code).toBe('FORBIDDEN');
      const missing = await setInitialStock(deps(), owner(), {
        productId: '3f2504e0-4f89-41d3-9a0c-0305e82c3399',
        quantity: '1',
        unitCost: 1,
      });
      expect(!missing.ok && missing.error.code).toBe('NOT_FOUND');
    });
  });

  describe('reading', () => {
    it('gives the employee levels and movements without unit cost, the owner with it', async () => {
      const productId = await withStock('5');
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      await access.addMember({
        tenantId: access.tenantId(),
        userId: EMPLOYEE_ID,
        role: 'employee',
      });
      const get = async (userId: string, path: string) =>
        request(server())
          .get(path)
          .set('Authorization', await access.bearer({ sub: userId }))
          .set('X-Tenant-Id', access.tenantId());

      const own = await get(OWNER_ID, `/api/v1/inventory/movements?productId=${productId}`);
      expect(own.status).toBe(200);
      expect(own.body.items[0]).toMatchObject({
        kind: 'initial',
        quantity: '5.000',
        unitCost: 500,
      });
      expect(stockMovementOwnerSchema.safeParse(own.body.items[0]).success).toBe(true);

      const staff = await get(EMPLOYEE_ID, `/api/v1/inventory/movements?productId=${productId}`);
      expect(staff.status).toBe(200);
      expect(staff.body.items[0]).not.toHaveProperty('unitCost');
      expect(stockMovementEmployeeSchema.safeParse(staff.body.items[0]).success).toBe(true);
      expect(listMovementsResponseSchema.safeParse(staff.body).success).toBe(true);

      const levels = await get(EMPLOYEE_ID, `/api/v1/inventory/levels?productId=${productId}`);
      expect(levels.body.items).toEqual([
        expect.objectContaining({ productId, quantity: '5.000' }),
      ]);
      const many = await get(
        EMPLOYEE_ID,
        `/api/v1/inventory/levels?productIds=${productId},${productId}`,
      );
      expect(many.body.total).toBe(1);
    });

    it('lists newest movements first and pages them', async () => {
      const productId = await withStock('5');
      await adjustStock(deps(), owner(), { productId, delta: '1', reason: 'conteo' });
      await adjustStock(deps(), owner(), { productId, delta: '-1', reason: 'merma' });
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const response = await request(server())
        .get(`/api/v1/inventory/movements?productId=${productId}&pageSize=2`)
        .set('Authorization', await access.bearer({ sub: OWNER_ID }))
        .set('X-Tenant-Id', access.tenantId());
      expect(response.body.total).toBe(3);
      expect(response.body.items).toHaveLength(2);
    });

    it('lists the low-stock products: under their minimum, and every one below zero', async () => {
      const low = await withStock('4', { minStock: '5' });
      await withStock('50', { minStock: '5' });
      const negative = await withStock('1');
      await move(owner({ allowNegativeStock: true }), {
        productId: negative,
        kind: 'sale',
        quantity: '-3',
      });
      const never = await seedProduct(access.testDb(), access.tenantId(), { minStock: '2' });
      const result = await listLowStock(deps(), employee(), { page: 1, pageSize: 20 });
      expect(result.ok && result.value.items.map((item) => item.productId).sort()).toEqual(
        [low, negative, never].sort(),
      );
      expect(result.ok && result.value.total).toBe(3);
      expect(result.ok && lowStockResponseSchema.safeParse(result.value).success).toBe(true);
    });

    it('answers 400 for a malformed product id in a query', async () => {
      await access.addMember({ tenantId: access.tenantId(), userId: OWNER_ID, role: 'owner' });
      const response = await request(server())
        .get('/api/v1/inventory/movements?productId=nope')
        .set('Authorization', await access.bearer({ sub: OWNER_ID }))
        .set('X-Tenant-Id', access.tenantId());
      expect(response.status).toBe(400);
    });
  });

  describe('inventory:verify', () => {
    it('finds no drift after normal operations and reports a level that disagrees with the ledger', async () => {
      const productId = await withStock('10');
      await adjustStock(deps(), owner(), { productId, delta: '-4', reason: 'merma' });
      const output: string[] = [];
      const run = () =>
        access.testDb().db.transaction(async (tx) => {
          expect(await findStockDrift(tx)).toEqual([]);
        });
      await run();
      expect(
        await verifyStockLevels(access.testDb().db, {
          log: (line) => output.push(line),
          logError: (line) => output.push(line),
        }),
      ).toBe(0);

      await access
        .testDb()
        .client.query('update stock_levels set quantity = 99 where product_id = $1', [productId]);
      const code = await verifyStockLevels(access.testDb().db, {
        log: (line) => output.push(line),
        logError: (line) => output.push(line),
      });
      expect(code).toBe(1);
      expect(output.join('\n')).toContain(`level 99.000, ledger 6.000`);
    });
  });

  describe('tenant isolation', () => {
    it('keeps the ledger and the levels of tenant A away from tenant B', async () => {
      // isolation requirement of the Definition of Done, for both tables
      const [tenantA, tenantB] = [access.tenantId(), access.otherTenantId()];
      const products = new Map<string, string>();
      for (const table of ['movements', 'levels'] as const) {
        await expectTenantIsolation<{ tenantId: string }>({
          tenantA,
          tenantB,
          seed: async (tenantId) => {
            if (!products.has(tenantId)) {
              const productId = await seedProduct(access.testDb(), tenantId);
              products.set(tenantId, productId);
              const result = await move(owner({}, tenantId), {
                productId,
                kind: 'initial',
                quantity: '3',
              });
              if (!result.ok) throw result.error;
            }
          },
          list: async (scope) => {
            const target = scope?.tenantId ?? tenantA;
            const productId = products.get(target) ?? '';
            const items = await access
              .testDb()
              .withTransaction(scope, async (tx) =>
                table === 'movements'
                  ? (await stock.listMovements(tx, target, productId, { page: 1, pageSize: 50 }))
                      .items
                  : (await stock.listLevels(tx, target, { page: 1, pageSize: 50 })).items,
              );
            return items.map(() => ({ tenantId: target }));
          },
        });
      }
      const crossed = await access
        .testDb()
        .withTransaction({ tenantId: tenantB, events: [] }, (tx) =>
          stock.listMovements(tx, tenantA, products.get(tenantA) ?? '', { page: 1, pageSize: 50 }),
        );
      expect(crossed.items).toEqual([]);
    });

    it('refuses at the database a movement or level of one tenant that points at the product of another', async () => {
      const foreign = await seedProduct(access.testDb(), access.otherTenantId());
      await expect(
        access
          .testDb()
          .client.query(
            "insert into stock_movements (tenant_id, product_id, kind, quantity, created_by) values ($1, $2, 'purchase', 1, $3)",
            [access.tenantId(), foreign, OWNER_ID],
          ),
      ).rejects.toThrow();
      await expect(
        access
          .testDb()
          .client.query(
            'insert into stock_levels (tenant_id, product_id, quantity) values ($1, $2, 1)',
            [access.tenantId(), foreign],
          ),
      ).rejects.toThrow();
    });

    it('rejects, as app_user, a movement written for another tenant', async () => {
      const productId = await seedProduct(access.testDb(), access.otherTenantId());
      await expectDbError(
        access
          .testDb()
          .withTransaction({ tenantId: access.tenantId(), events: [] }, (tx) =>
            stock.insertMovements(
              tx,
              access.otherTenantId(),
              OWNER_ID,
              [movementOf({ productId, kind: 'purchase', quantity: '1' })],
              clock.now(),
            ),
          ),
        /row-level security/,
      );
    });
  });
});
