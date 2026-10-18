import { apiErrorSchema } from '@mini-market/contracts/common';
import { tenantResponseSchema } from '@mini-market/contracts/tenancy';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { presetFor } from '../../src/modules/tenancy';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';

// The routes of the tenancy module behind the real guards of the access module (issue #11):
// a valid token, `X-Tenant-Id` and an active membership.
describe('GET /api/v1/tenant and PATCH /api/v1/tenant/settings', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'patch',
    path: string,
    userId: string,
    options: { body?: object; tenant?: string | null } = {},
  ) => {
    const agent = request(server());
    const req = agent[method](path).set('Authorization', await ctx.bearer({ sub: userId }));
    const tenant = options.tenant === undefined ? ctx.tenantId() : options.tenant;
    const scoped = tenant === null ? req : req.set('X-Tenant-Id', tenant);
    return options.body ? scoped.send(options.body) : scoped;
  };
  const seedOwner = () =>
    ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
  const seedEmployee = () =>
    ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });

  it('answers 401 UNAUTHENTICATED without a token, before any tenant logic runs', async () => {
    await seedOwner();
    const response = await request(server())
      .patch('/api/v1/tenant/settings')
      .set('X-Tenant-Id', ctx.tenantId())
      .send({ allowNegativeStock: true })
      .expect(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers 400 without X-Tenant-Id and 403 NOT_A_MEMBER for a caller outside the tenant (fails closed)', async () => {
    await seedOwner();
    await call('get', '/api/v1/tenant', OWNER_ID, { tenant: null }).then((response) =>
      expect(response.status).toBe(400),
    );
    const outsider = await call('get', '/api/v1/tenant', EMPLOYEE_ID);
    expect(outsider.status).toBe(403);
    expect(outsider.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('returns name and settings to an employee, matching the response contract', async () => {
    await seedEmployee();
    const response = await call('get', '/api/v1/tenant', EMPLOYEE_ID).then((res) => res);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: ctx.tenantId(),
      slug: 'sol',
      name: 'Business sol',
      settings: presetFor('minimarket'),
    });
    expect(tenantResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('lets the owner patch one key: it persists and every other key is untouched', async () => {
    // AC-2 of #10
    await seedOwner();
    const response = await call('patch', '/api/v1/tenant/settings', OWNER_ID, {
      body: { allowNegativeStock: true },
    });
    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual({
      ...presetFor('minimarket'),
      allowNegativeStock: true,
    });
    expect(tenantResponseSchema.safeParse(response.body).success).toBe(true);

    const reread = await call('get', '/api/v1/tenant', OWNER_ID);
    expect(reread.body.settings).toEqual({ ...presetFor('minimarket'), allowNegativeStock: true });
  });

  it('answers an employee PATCH with 403 and the FORBIDDEN code, and changes nothing', async () => {
    // AC-3 of #10
    await seedOwner();
    await seedEmployee();
    const response = await call('patch', '/api/v1/tenant/settings', EMPLOYEE_ID, {
      body: { allowNegativeStock: true },
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
    const reread = await call('get', '/api/v1/tenant', OWNER_ID);
    expect(reread.body.settings.allowNegativeStock).toBe(false);
  });

  it('answers 400 with field errors for an unknown time zone', async () => {
    // AC-5 of #10
    await seedOwner();
    const response = await call('patch', '/api/v1/tenant/settings', OWNER_ID, {
      body: { timezone: 'Mars/Base' },
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { issues: [{ path: 'timezone' }] },
    });
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    const reread = await call('get', '/api/v1/tenant', OWNER_ID);
    expect(reread.body.settings.timezone).toBe('America/La_Paz');
  });

  it.each([
    [{ unknownKey: true }],
    [{ modules: { nope: true } }],
    [{ allowNegativeStock: 'yes' }],
    [{ vertical: 'bookshop' }],
    [{ currency: 'USD' }],
  ])('answers 400 for the invalid patch %j', async (body) => {
    // AC-5 of #10
    await seedOwner();
    const response = await call('patch', '/api/v1/tenant/settings', OWNER_ID, { body });
    expect(response.status).toBe(400);
  });

  it('answers 403 NOT_A_MEMBER, the same as for any outsider, when the tenant does not exist', async () => {
    await seedOwner();
    const response = await call('get', '/api/v1/tenant', OWNER_ID, {
      tenant: '00000000-0000-0000-0000-0000000000aa',
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });
});
