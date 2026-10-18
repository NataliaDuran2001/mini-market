import { apiErrorSchema } from '@mini-market/contracts/common';
import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  Ctx,
  RequirePermission,
  WithoutTenant,
  permissionsProvider,
} from '../../src/modules/access';
import type { TenantContext } from '../../src/modules/access';
import { EMPLOYEE_ID, OTHER_OWNER_ID, OWNER_ID, useAccessApp } from '../access-fixture';

// Throwaway routes that stand in for the controllers of the modules that arrive later.
@Controller('probe')
class ProbeController {
  @Get('open')
  open(@Ctx() ctx: TenantContext) {
    return { tenantId: ctx.tenantId, role: ctx.role, permissions: ctx.permissions };
  }

  @Get('reports')
  @RequirePermission('reports.read')
  reports(@Ctx() ctx: TenantContext) {
    return { tenantId: ctx.tenantId };
  }

  @Get('void')
  @RequirePermission('sales.void')
  voidSale() {
    return { ok: true };
  }

  @Get('typo')
  @RequirePermission('sales.voidd')
  typo() {
    return { ok: true };
  }

  @Get('no-tenant')
  @WithoutTenant()
  @RequirePermission('reports.read')
  permissionWithoutTenant() {
    return { ok: true };
  }
}

describe('tenant guard and @RequirePermission', () => {
  const ctx = useAccessApp({
    controllers: [ProbeController],
    providers: [
      permissionsProvider('reports', { 'reports.read': { owner: true, employee: false } }),
      permissionsProvider('sales', {
        'sales.void': { owner: true, employee: (settings) => settings.employeeCanVoid },
      }),
    ],
  });
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const get = async (path: string, userId: string, tenant: string | undefined = ctx.tenantId()) => {
    const req = request(server())
      .get(`/api/v1/probe/${path}`)
      .set('Authorization', await ctx.bearer({ sub: userId }));
    return tenant ? req.set('X-Tenant-Id', tenant) : req;
  };
  const patchSettings = async (userId: string, body: object) =>
    request(server())
      .patch('/api/v1/tenant/settings')
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', ctx.tenantId())
      .send(body);
  const seedOwner = () =>
    ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
  const seedEmployee = () =>
    ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });

  it('answers 403 NOT_A_MEMBER to a user who is not a member of the tenant', async () => {
    // AC-1
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });

    const response = await get('open', OTHER_OWNER_ID);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('gives the same 403 NOT_A_MEMBER for a tenant that does not exist', async () => {
    // a caller cannot tell an unknown business from one they are not part of
    await seedOwner();

    const response = await get('open', OWNER_ID, '00000000-0000-0000-0000-0000000000aa');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('answers 400 when X-Tenant-Id is missing or not a UUID, and 401 before that without a token', async () => {
    await seedOwner();

    expect((await get('open', OWNER_ID, '')).status).toBe(400);
    const malformed = await get('open', OWNER_ID, 'not-a-uuid');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    await request(server())
      .get('/api/v1/probe/open')
      .set('X-Tenant-Id', ctx.tenantId())
      .expect(401);
  });

  it('gives a member the context of the tenant they named, with role and permissions', async () => {
    await seedOwner();
    await seedEmployee();

    const owner = await get('open', OWNER_ID);
    expect(owner.status).toBe(200);
    expect(owner.body).toMatchObject({ tenantId: ctx.tenantId(), role: 'owner' });
    expect(owner.body.permissions).toEqual(
      expect.arrayContaining(['members.manage', 'reports.read', 'sales.void']),
    );
    const employee = await get('open', EMPLOYEE_ID);
    expect(employee.body).toMatchObject({ role: 'employee' });
    expect(employee.body.permissions).not.toContain('members.manage');
    expect(employee.body.permissions).not.toContain('reports.read');
  });

  it('answers 403 FORBIDDEN naming the permission when an employee calls an owner route', async () => {
    // AC-2
    await seedEmployee();

    const response = await get('reports', EMPLOYEE_ID);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'reports.read' });
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
  });

  it('lets the owner through the same route', async () => {
    // AC-2 (positive control)
    await seedOwner();
    const response = await get('reports', OWNER_ID);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tenantId: ctx.tenantId() });
  });

  it('evaluates sales.void against the settings: employee refused, then allowed once the owner flips employeeCanVoid', async () => {
    // AC-3 (permission evaluation reads the settings snapshot of every request)
    await seedOwner();
    await seedEmployee();

    const refused = await get('void', EMPLOYEE_ID);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'FORBIDDEN', permission: 'sales.void' });

    expect((await patchSettings(OWNER_ID, { employeeCanVoid: true })).status).toBe(200);
    expect((await get('void', EMPLOYEE_ID)).status).toBe(200);

    expect((await patchSettings(OWNER_ID, { employeeCanVoid: false })).status).toBe(200);
    expect((await get('void', EMPLOYEE_ID)).status).toBe(403);
  });

  it('refuses a disabled member on the next request', async () => {
    // AC-5 (the disable use case is covered in members.test.ts)
    await ctx.addMember({
      tenantId: ctx.tenantId(),
      userId: EMPLOYEE_ID,
      role: 'employee',
      status: 'disabled',
    });

    const response = await get('open', EMPLOYEE_ID);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('denies an unknown permission to everybody, the owner included', async () => {
    // ctx.can on a name nobody registered: a typo locks out, never lets in
    await seedOwner();
    const response = await get('typo', OWNER_ID);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'sales.voidd' });
  });

  it('denies a permission declared on a route that has no tenant context', async () => {
    await seedOwner();
    const response = await request(server())
      .get('/api/v1/probe/no-tenant')
      .set('Authorization', await ctx.bearer({ sub: OWNER_ID }));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
  });
});
