import { apiErrorSchema } from '@mini-market/contracts/common';
import { tenantResponseSchema } from '@mini-market/contracts/tenancy';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTenant } from '../../src/modules/tenancy/application/create-tenant';
import { createTenantRepository } from '../../src/modules/tenancy/infrastructure/tenant.repository';
import { presetFor } from '../../src/modules/tenancy';
import { bearerFor, createTestApp } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { aScope } from '../helpers/tenancy-scope';

// Until the tenant guard of issue #11 exists, a test middleware plays its part: it reads the
// caller from a header and puts the scope on the request, the way the guard will.
const SCOPE_HEADER = 'x-test-scope';

describe('GET /api/v1/tenant and PATCH /api/v1/tenant/settings', () => {
  let testDb: TestDb;
  let app: INestApplication;
  let tenantId: string;
  let bearer: string;
  const asHeader = (role: 'owner' | 'employee', id = tenantId): string =>
    JSON.stringify({ tenantId: id, role });

  beforeAll(async () => {
    testDb = await createTestDb();
    app = await createTestApp({
      database: testDb.db,
      beforeInit: (nest) =>
        nest.use(
          (
            req: { headers: Record<string, string>; tenantScope?: unknown },
            _res: unknown,
            next: () => void,
          ) => {
            const header = req.headers[SCOPE_HEADER];
            if (header) {
              const { tenantId: id, role } = JSON.parse(header) as {
                tenantId: string;
                role: 'owner' | 'employee';
              };
              req.tenantScope = aScope(id, role);
            }
            next();
          },
        ),
    });
    bearer = await bearerFor(app);
  });
  afterAll(async () => {
    await app.close();
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    const created = await createTenant(
      {
        tenants: createTenantRepository(testDb.withTransaction),
        events: { publish: () => Promise.resolve() },
        clock: { now: () => new Date('2026-10-15T14:00:00Z') },
      },
      { name: 'Minimarket Sol', slug: 'sol', vertical: 'minimarket' },
    );
    tenantId = unwrapOrThrow(created).id;
  });

  // Every route except @Public() ones needs a valid Supabase token (issue #9).
  const http = () => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('Authorization', bearer),
    patch: (path: string) => request(app.getHttpServer()).patch(path).set('Authorization', bearer),
  });

  it('answers 401 UNAUTHENTICATED without a token, before any tenant logic runs', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/tenant/settings')
      .set(SCOPE_HEADER, asHeader('owner'))
      .send({ allowNegativeStock: true })
      .expect(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers 403 when no tenant context was resolved (fails closed)', async () => {
    const response = await http().get('/api/v1/tenant').expect(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns name and settings to an employee, matching the response contract', async () => {
    const response = await http()
      .get('/api/v1/tenant')
      .set(SCOPE_HEADER, asHeader('employee'))
      .expect(200);
    expect(response.body).toEqual({
      id: tenantId,
      slug: 'sol',
      name: 'Minimarket Sol',
      settings: presetFor('minimarket'),
    });
    expect(tenantResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('lets the owner patch one key: it persists and every other key is untouched', async () => {
    // AC-2
    const response = await http()
      .patch('/api/v1/tenant/settings')
      .set(SCOPE_HEADER, asHeader('owner'))
      .send({ allowNegativeStock: true })
      .expect(200);
    expect(response.body.settings).toEqual({
      ...presetFor('minimarket'),
      allowNegativeStock: true,
    });
    expect(tenantResponseSchema.safeParse(response.body).success).toBe(true);

    const reread = await http()
      .get('/api/v1/tenant')
      .set(SCOPE_HEADER, asHeader('owner'))
      .expect(200);
    expect(reread.body.settings).toEqual({ ...presetFor('minimarket'), allowNegativeStock: true });
  });

  it('answers an employee PATCH with 403 and the FORBIDDEN code, and changes nothing', async () => {
    // AC-3
    const response = await http()
      .patch('/api/v1/tenant/settings')
      .set(SCOPE_HEADER, asHeader('employee'))
      .send({ allowNegativeStock: true })
      .expect(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    const reread = await http()
      .get('/api/v1/tenant')
      .set(SCOPE_HEADER, asHeader('owner'))
      .expect(200);
    expect(reread.body.settings.allowNegativeStock).toBe(false);
  });

  it('answers 400 with field errors for an unknown time zone', async () => {
    // AC-5
    const response = await http()
      .patch('/api/v1/tenant/settings')
      .set(SCOPE_HEADER, asHeader('owner'))
      .send({ timezone: 'Mars/Base' })
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'timezone' }] },
    });
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    const reread = await http()
      .get('/api/v1/tenant')
      .set(SCOPE_HEADER, asHeader('owner'))
      .expect(200);
    expect(reread.body.settings.timezone).toBe('America/La_Paz');
  });

  it.each([
    [{ unknownKey: true }],
    [{ modules: { nope: true } }],
    [{ allowNegativeStock: 'yes' }],
    [{ vertical: 'bookshop' }],
    [{ currency: 'USD' }],
  ])('answers 400 for the invalid patch %j', async (body) => {
    // AC-5
    await http()
      .patch('/api/v1/tenant/settings')
      .set(SCOPE_HEADER, asHeader('owner'))
      .send(body)
      .expect(400);
  });

  it('answers 404 with the NOT_FOUND code when the tenant of the context does not exist', async () => {
    const response = await http()
      .get('/api/v1/tenant')
      .set(SCOPE_HEADER, asHeader('owner', '00000000-0000-0000-0000-0000000000aa'))
      .expect(404);
    expect(response.body).toMatchObject({ code: 'NOT_FOUND' });
  });
});
