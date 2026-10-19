import { supplierSchema } from '@mini-market/contracts/purchasing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DrizzleSupplierRepository } from '../../src/modules/purchasing/infrastructure/drizzle-supplier.repository';
import { EMPLOYEE_ID, OWNER_ID, OTHER_OWNER_ID, useAccessApp } from '../access-fixture';
import { expectTenantIsolation } from '../isolation';

const NEW_SUPPLIER = { name: 'Distribuidora Sur', phone: '70011223', email: 'Ventas@Sur.com' };

describe('suppliers', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'post' | 'patch',
    path: string,
    userId: string,
    options: { body?: object; tenant?: string } = {},
  ) => {
    const agent = request(server());
    const req = agent[method](path)
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', options.tenant ?? ctx.tenantId());
    return options.body ? req.send(options.body) : req;
  };
  const seedTeam = async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
  };
  const create = async (body: object = NEW_SUPPLIER, userId = OWNER_ID, tenant?: string) =>
    call('post', '/api/v1/suppliers', userId, tenant ? { body, tenant } : { body });

  describe('POST /api/v1/suppliers', () => {
    it('creates a supplier for the owner and answers the contract shape', async () => {
      await seedTeam();

      const response = await create();

      expect(response.status).toBe(201);
      expect(supplierSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        name: 'Distribuidora Sur',
        phone: '70011223',
        email: 'ventas@sur.com',
        taxId: null,
        notes: null,
        active: true,
      });
      expect(response.body).not.toHaveProperty('tenantId');
    });

    it('rejects a duplicate name in the tenant, ignoring case and spaces around it', async () => {
      // AC-1
      await seedTeam();
      await create();

      const response = await create({ name: '  distribuidora SUR ' });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'SUPPLIER_NAME_TAKEN' });
    });

    it('lets another tenant use the same name', async () => {
      await seedTeam();
      await create();

      const response = await create(NEW_SUPPLIER, OTHER_OWNER_ID, ctx.otherTenantId());

      expect(response.status).toBe(201);
    });

    it('is closed to employees: 403 naming suppliers.manage', async () => {
      // AC-2
      await seedTeam();

      const response = await create(NEW_SUPPLIER, EMPLOYEE_ID);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'suppliers.manage' });
    });

    it('rejects a blank name and unknown fields with 400', async () => {
      await seedTeam();
      expect((await create({ name: '  ' })).status).toBe(400);
      expect((await create({ name: 'Ok', tenantId: ctx.otherTenantId() })).status).toBe(400);
    });
  });

  describe('GET /api/v1/suppliers', () => {
    it('lets an employee list the suppliers (view only)', async () => {
      // AC-2
      await seedTeam();
      await create();

      const response = await call('get', '/api/v1/suppliers', EMPLOYEE_ID);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
    });

    it('never lists the suppliers of another tenant', async () => {
      // AC-3
      await seedTeam();
      await create({ name: 'Solo de sol' });
      await create({ name: 'Solo de luna' }, OTHER_OWNER_ID, ctx.otherTenantId());

      const response = await call('get', '/api/v1/suppliers', OTHER_OWNER_ID, {
        tenant: ctx.otherTenantId(),
      });

      expect(response.status).toBe(200);
      expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
        'Solo de luna',
      ]);
    });

    it('filters by text (name, phone, email, tax id) and by active, ordered by name', async () => {
      await seedTeam();
      await create({ name: 'Zeta', taxId: '1020304' });
      await create({ name: 'alfa', phone: '77712345' });
      const inactive = await create({ name: 'Beta 100%' });
      await call('patch', `/api/v1/suppliers/${inactive.body.id}`, OWNER_ID, {
        body: { active: false },
      });
      const names = async (query: string) =>
        (await call('get', `/api/v1/suppliers${query}`, OWNER_ID)).body.items.map(
          (item: { name: string }) => item.name,
        );

      expect(await names('')).toEqual(['alfa', 'Beta 100%', 'Zeta']);
      expect(await names('?active=true')).toEqual(['alfa', 'Zeta']);
      expect(await names('?active=false')).toEqual(['Beta 100%']);
      expect(await names('?q=1020')).toEqual(['Zeta']);
      expect(await names('?q=777')).toEqual(['alfa']);
      expect(await names('?q=100%25')).toEqual(['Beta 100%']);
      expect(await names('?q=%25')).toEqual(['Beta 100%']);
      expect(await names('?q=ALF')).toEqual(['alfa']);
    });

    it('rejects an invalid active filter with 400', async () => {
      await seedTeam();
      expect((await call('get', '/api/v1/suppliers?active=maybe', OWNER_ID)).status).toBe(400);
    });
  });

  describe('PATCH /api/v1/suppliers/:id', () => {
    it('changes the details, clears a blank optional field and keeps the rest', async () => {
      await seedTeam();
      const created = await create();

      const response = await call('patch', `/api/v1/suppliers/${created.body.id}`, OWNER_ID, {
        body: { name: 'Sur SRL', phone: '', notes: 'Entrega los lunes' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        name: 'Sur SRL',
        phone: null,
        email: 'ventas@sur.com',
        notes: 'Entrega los lunes',
        active: true,
      });
    });

    it('deactivates and reactivates a supplier without deleting it', async () => {
      await seedTeam();
      const created = await create();
      const path = `/api/v1/suppliers/${created.body.id}`;

      const off = await call('patch', path, OWNER_ID, { body: { active: false } });
      const again = await call('patch', path, OWNER_ID, { body: { active: false } });
      const on = await call('patch', path, OWNER_ID, { body: { active: true } });

      expect(off.body.active).toBe(false);
      expect(again.status).toBe(200);
      expect(on.body.active).toBe(true);
    });

    it('rejects renaming to the name of another supplier, but not to its own', async () => {
      // AC-1
      await seedTeam();
      await create({ name: 'Uno' });
      const two = await create({ name: 'Dos' });
      const path = `/api/v1/suppliers/${two.body.id}`;

      expect((await call('patch', path, OWNER_ID, { body: { name: 'UNO' } })).status).toBe(409);
      expect((await call('patch', path, OWNER_ID, { body: { name: 'DOS' } })).status).toBe(200);
    });

    it('is closed to employees', async () => {
      // AC-2
      await seedTeam();
      const created = await create();
      const path = `/api/v1/suppliers/${created.body.id}`;

      const details = await call('patch', path, EMPLOYEE_ID, { body: { name: 'Otro' } });
      const active = await call('patch', path, EMPLOYEE_ID, { body: { active: false } });

      expect(details.status).toBe(403);
      expect(active.status).toBe(403);
      expect(details.body).toMatchObject({ permission: 'suppliers.manage' });
    });

    it('answers 404 for an unknown id and for the id of another tenant, 400 for a malformed one', async () => {
      // AC-3
      await seedTeam();
      const theirs = await create({ name: 'De luna' }, OTHER_OWNER_ID, ctx.otherTenantId());
      const unknown = '3f2504e0-4f89-41d3-9a0c-0305e82c3999';

      const patch = (id: string, body: object) =>
        call('patch', `/api/v1/suppliers/${id}`, OWNER_ID, { body });

      expect((await patch(unknown, { name: 'X' })).status).toBe(404);
      expect((await patch(theirs.body.id, { name: 'X' })).status).toBe(404);
      expect((await patch(theirs.body.id, { active: false })).status).toBe(404);
      expect((await patch('not-a-uuid', { name: 'X' })).status).toBe(400);
      expect((await patch(unknown, {})).status).toBe(400);
      const stored = await ctx
        .testDb()
        .client.query('select active, name from suppliers where id = $1', [theirs.body.id]);
      expect(stored.rows).toEqual([{ active: true, name: 'De luna' }]);
    });
  });

  describe('the suppliers repository', () => {
    it('isolates tenants: reads, no tenant and writes for another tenant', async () => {
      // AC-3
      const repository = new DrizzleSupplierRepository();
      const testDb = ctx.testDb();
      const tenantA = ctx.tenantId();
      const tenantB = ctx.otherTenantId();
      const details = (name: string) => ({
        name,
        phone: null,
        email: null,
        taxId: null,
        notes: null,
      });

      await expectTenantIsolation({
        tenantA,
        tenantB,
        seed: (tenantId) =>
          testDb.asAdmin({ tenantId, events: [] }, async (tx) => {
            await repository.insert(tx, tenantId, details(`Proveedor ${tenantId}`), OWNER_ID);
          }),
        // The query always names tenant A, so a scope bound to B or to nothing proves RLS alone.
        list: async (scope) => {
          const named = scope?.tenantId ?? tenantA;
          return testDb.withTransaction(scope, (tx) => repository.list(tx, named, {}));
        },
        insertFor: (scope, tenantId) =>
          testDb.withTransaction(scope, async (tx) => {
            await repository.insert(tx, tenantId, details('Intruso'), OWNER_ID);
          }),
      });

      const crossRead = await testDb.withTransaction({ tenantId: tenantA, events: [] }, (tx) =>
        repository.list(tx, tenantB, {}),
      );
      expect(crossRead).toEqual([]);
    });
  });
});
