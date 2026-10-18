import { FixedClock, unwrapOrThrow } from '@mini-market/shared-kernel';
import type { DomainEvent } from '../../src/infrastructure/events/domain-event-bus';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTenant } from '../../src/modules/tenancy/application/create-tenant';
import { getTenantSettings } from '../../src/modules/tenancy/application/get-tenant-settings';
import { updateTenantSettings } from '../../src/modules/tenancy/application/update-tenant-settings';
import { createTenantRepository } from '../../src/modules/tenancy/infrastructure/tenant.repository';
import { tenants } from '../../src/modules/tenancy/infrastructure/schema';
import { presetFor } from '../../src/modules/tenancy';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { aScope } from '../helpers/tenancy-scope';

describe('tenancy use cases on PGlite', () => {
  let testDb: TestDb;
  const clock = new FixedClock('2026-10-15T14:00:00Z');
  const published: DomainEvent[] = [];

  const build = () => {
    const repo = createTenantRepository(testDb.withTransaction);
    const events = {
      publish: (batch: readonly DomainEvent[]): Promise<void> => testDb.bus.dispatch(batch),
    };
    return {
      repo,
      create: (input: Parameters<typeof createTenant>[1]) =>
        createTenant({ tenants: repo, events, clock }, input),
      get: (scope: Parameters<typeof getTenantSettings>[1]) =>
        getTenantSettings({ tenants: repo }, scope),
      update: (
        scope: Parameters<typeof updateTenantSettings>[1],
        patch: Parameters<typeof updateTenantSettings>[2],
      ) => updateTenantSettings({ tenants: repo, clock }, scope, patch),
    };
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    testDb.bus.subscribe('TenantCreated', (event) => void published.push(event));
    testDb.bus.subscribe('TenantSettingsChanged', (event) => void published.push(event));
  });
  afterAll(() => testDb.close());
  beforeEach(async () => {
    await testDb.truncateAll();
    published.length = 0;
  });

  describe('createTenant', () => {
    it('stores the farmacia preset: lots and fractional on, La Paz, BOB', async () => {
      // AC-1
      const created = unwrapOrThrow(
        await build().create({
          name: 'Farmacia Central',
          slug: 'farmacia-central',
          vertical: 'farmacia',
        }),
      );
      expect(created.settings.modules).toMatchObject({ lots: true, fractional: true });
      expect(created.settings.timezone).toBe('America/La_Paz');
      expect(created.settings.currency).toBe('BOB');
      const [row] = await testDb.db.select().from(tenants).where(eq(tenants.id, created.id));
      expect(row?.settings).toEqual(presetFor('farmacia'));
      expect(row?.createdAt).toEqual(new Date('2026-10-15T14:00:00Z'));
    });

    it('seeds each vertical with its own preset', async () => {
      // AC-1
      const app = build();
      const minimarket = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      const generic = unwrapOrThrow(
        await app.create({ name: 'Otro', slug: 'otro', vertical: 'generic' }),
      );
      expect(minimarket.settings).toEqual(presetFor('minimarket'));
      expect(generic.settings).toEqual(presetFor('generic'));
    });

    it('publishes TenantCreated after the tenant is stored, with the vertical for catalog seeding', async () => {
      // AC-1
      const created = unwrapOrThrow(
        await build().create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      expect(published).toEqual([
        {
          type: 'TenantCreated',
          tenantId: created.id,
          slug: 'sol',
          vertical: 'minimarket',
          settings: presetFor('minimarket'),
          occurredAt: new Date('2026-10-15T14:00:00Z'),
        },
      ]);
    });

    it('returns a Conflict for a slug that is taken and publishes nothing', async () => {
      const app = build();
      unwrapOrThrow(await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }));
      published.length = 0;
      const again = await app.create({ name: 'Otro Sol', slug: 'sol', vertical: 'generic' });
      expect(again.ok).toBe(false);
      if (again.ok) return;
      expect(again.error.code).toBe('CONFLICT');
      expect(published).toEqual([]);
      expect(await testDb.db.select().from(tenants)).toHaveLength(1);
    });

    it('returns a Validation error with the failing fields for bad input', async () => {
      // AC-5
      const result = await build().create({ name: ' ', slug: 'Bad Slug', vertical: 'generic' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toMatchObject({
        issues: [{ path: 'name' }, { path: 'slug' }],
      });
      expect(await testDb.db.select().from(tenants)).toHaveLength(0);
    });

    it('rejects a slug the database check constraint does not accept even if the use case is bypassed', async () => {
      await expect(
        testDb.db.insert(tenants).values({ slug: 'Not Valid', name: 'x', settings: {} }),
      ).rejects.toThrow();
    });
  });

  describe('getTenantSettings', () => {
    it('returns name and settings to an employee as well as to the owner', async () => {
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      for (const role of ['owner', 'employee'] as const) {
        const view = unwrapOrThrow(await app.get(aScope(tenant.id, role)));
        expect(view).toEqual({
          id: tenant.id,
          slug: 'sol',
          name: 'Sol',
          settings: presetFor('minimarket'),
        });
      }
    });

    it('fills defaults for keys a row written earlier does not have', async () => {
      const [row] = await testDb.db
        .insert(tenants)
        .values({
          slug: 'old',
          name: 'Old',
          settings: { vertical: 'minimarket', modules: { lots: true } },
        })
        .returning();
      const view = unwrapOrThrow(await build().get(aScope(row?.id ?? '', 'owner')));
      expect(view.settings.modules).toEqual({
        lots: true,
        fractional: false,
        credit_sales: false,
        custom_fields: false,
      });
      expect(view.settings.timezone).toBe('America/La_Paz');
    });

    it('reports a Validation error instead of trusting corrupt stored settings', async () => {
      const [row] = await testDb.db
        .insert(tenants)
        .values({ slug: 'broken', name: 'Broken', settings: { timezone: 'Mars/Base' } })
        .returning();
      const result = await build().get(aScope(row?.id ?? '', 'owner'));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toMatchObject({ issues: [{ path: 'timezone' }] });
    });

    it('returns NotFound for a context whose tenant does not exist', async () => {
      const result = await build().get(aScope('00000000-0000-0000-0000-0000000000aa', 'owner'));
      expect(!result.ok && result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('updateTenantSettings', () => {
    it('persists the patch and leaves every other key untouched', async () => {
      // AC-2
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      const updated = unwrapOrThrow(
        await app.update(aScope(tenant.id, 'owner'), { allowNegativeStock: true }),
      );
      expect(updated.settings).toEqual({ ...presetFor('minimarket'), allowNegativeStock: true });
      const reread = unwrapOrThrow(await app.get(aScope(tenant.id, 'owner')));
      expect(reread.settings).toEqual({ ...presetFor('minimarket'), allowNegativeStock: true });
    });

    it('merges module flags one by one and bumps updated_at from the clock', async () => {
      // AC-2
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      clock.set('2026-10-16T09:30:00Z');
      const updated = unwrapOrThrow(
        await app.update(aScope(tenant.id, 'owner'), { modules: { lots: true } }),
      );
      expect(updated.settings.modules).toEqual({ ...presetFor('minimarket').modules, lots: true });
      const [row] = await testDb.db.select().from(tenants).where(eq(tenants.id, tenant.id));
      expect(row?.updatedAt).toEqual(new Date('2026-10-16T09:30:00Z'));
      expect(row?.createdAt).toEqual(new Date('2026-10-15T14:00:00Z'));
      clock.set('2026-10-15T14:00:00Z');
    });

    it('queues TenantSettingsChanged with before and after, delivered after commit', async () => {
      // AC-2
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      published.length = 0;
      unwrapOrThrow(await app.update(aScope(tenant.id, 'owner'), { employeeCanVoid: true }));
      expect(published).toEqual([
        {
          type: 'TenantSettingsChanged',
          tenantId: tenant.id,
          userId: `owner-of-${tenant.id}`,
          before: presetFor('minimarket'),
          after: { ...presetFor('minimarket'), employeeCanVoid: true },
          occurredAt: clock.now(),
        },
      ]);
    });

    it('forbids an employee and changes nothing', async () => {
      // AC-3 (use-case level, until the permissions of #11 are wired)
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      published.length = 0;
      const result = await app.update(aScope(tenant.id, 'employee'), { allowNegativeStock: true });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.httpStatus).toBe(403);
      const reread = unwrapOrThrow(await app.get(aScope(tenant.id, 'owner')));
      expect(reread.settings.allowNegativeStock).toBe(false);
      expect(published).toEqual([]);
    });

    it('rejects an invalid patch with the failing field and changes nothing', async () => {
      // AC-5
      const app = build();
      const tenant = unwrapOrThrow(
        await app.create({ name: 'Sol', slug: 'sol', vertical: 'minimarket' }),
      );
      const result = await app.update(aScope(tenant.id, 'owner'), { timezone: 'Mars/Base' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toMatchObject({ issues: [{ path: 'timezone' }] });
      const reread = unwrapOrThrow(await app.get(aScope(tenant.id, 'owner')));
      expect(reread.settings.timezone).toBe('America/La_Paz');
    });

    it('returns NotFound and publishes nothing when the tenant of the context is gone', async () => {
      const ctx = aScope('00000000-0000-0000-0000-0000000000aa', 'owner');
      const result = await build().update(ctx, { allowNegativeStock: true });
      expect(!result.ok && result.error.code).toBe('NOT_FOUND');
      expect(ctx.events).toEqual([]);
    });

    it('refuses to overwrite corrupt stored settings and keeps the row as it was', async () => {
      const [row] = await testDb.db
        .insert(tenants)
        .values({ slug: 'broken', name: 'Broken', settings: { timezone: 'Mars/Base' } })
        .returning();
      const ctx = aScope(row?.id ?? '', 'owner');
      const result = await build().update(ctx, { allowNegativeStock: true });
      expect(!result.ok && result.error.code).toBe('VALIDATION_ERROR');
      const [after] = await testDb.db
        .select()
        .from(tenants)
        .where(eq(tenants.id, row?.id ?? ''));
      expect(after?.settings).toEqual({ timezone: 'Mars/Base' });
      expect(ctx.events).toEqual([]);
    });
  });

  describe('tenant isolation', () => {
    it('tenant A can read and change only tenant A, never tenant B', async () => {
      // AC-2 (isolation template for later repositories: A reads and changes A, never B)
      const app = build();
      const a = unwrapOrThrow(
        await app.create({ name: 'A', slug: 'tenant-a', vertical: 'minimarket' }),
      );
      const b = unwrapOrThrow(
        await app.create({ name: 'B', slug: 'tenant-b', vertical: 'farmacia' }),
      );

      expect(unwrapOrThrow(await app.get(aScope(a.id, 'owner'))).name).toBe('A');
      expect(unwrapOrThrow(await app.get(aScope(b.id, 'owner'))).name).toBe('B');
      expect((await app.repo.findById(aScope(a.id, 'owner')))?.id).toBe(a.id);

      unwrapOrThrow(
        await app.update(aScope(a.id, 'owner'), {
          allowNegativeStock: true,
          modules: { lots: true },
        }),
      );

      const untouched = unwrapOrThrow(await app.get(aScope(b.id, 'owner')));
      expect(untouched.settings).toEqual(presetFor('farmacia'));
      expect(unwrapOrThrow(await app.get(aScope(a.id, 'owner'))).settings.allowNegativeStock).toBe(
        true,
      );
    });

    it('a scope whose settings snapshot claims other flags still reads the stored truth of its own tenant', async () => {
      const app = build();
      const a = unwrapOrThrow(
        await app.create({ name: 'A', slug: 'tenant-a', vertical: 'minimarket' }),
      );
      const lying = aScope(a.id, 'owner', { vertical: 'farmacia' });
      expect(unwrapOrThrow(await app.get(lying)).settings).toEqual(presetFor('minimarket'));
    });
  });
});
