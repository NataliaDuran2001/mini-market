import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OTHER_OWNER_ID, OWNER_ID, useAccessApp } from '../access-fixture';

interface AuditRow {
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: Date;
}

describe('PATCH /api/v1/members/:userId with status active', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'patch',
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
  const enable = (target: string, actor = OWNER_ID) =>
    call('patch', `/api/v1/members/${target}`, actor, { body: { status: 'active' } });
  const audit = async () =>
    (
      await ctx
        .testDb()
        .client.query<AuditRow>(
          'select tenant_id, actor_user_id, action, entity, entity_id, before, after, at from audit_log order by at, id',
        )
    ).rows;
  const rowOf = async (tenantId: string, userId: string) =>
    (
      await ctx
        .testDb()
        .client.query<{ role: string; status: string }>(
          'select role, status from memberships where tenant_id = $1 and user_id = $2',
          [tenantId, userId],
        )
    ).rows[0];
  const seedTeam = async (employeeStatus: 'active' | 'disabled' = 'disabled') => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({
      tenantId: ctx.tenantId(),
      userId: EMPLOYEE_ID,
      role: 'employee',
      status: employeeStatus,
    });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
  };

  it('brings a disabled employee back: active again, can use the API, audited as member.enabled', async () => {
    // AC-5
    await seedTeam();
    const refused = await call('get', '/api/v1/tenant', EMPLOYEE_ID);
    expect(refused.status).toBe(403);

    const response = await enable(EMPLOYEE_ID);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: EMPLOYEE_ID,
      role: 'employee',
      status: 'active',
    });
    expect(await rowOf(ctx.tenantId(), EMPLOYEE_ID)).toEqual({
      role: 'employee',
      status: 'active',
    });
    const afterwards = await call('get', '/api/v1/tenant', EMPLOYEE_ID);
    expect(afterwards.status).toBe(200);
    const entries = await audit();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      tenant_id: ctx.tenantId(),
      action: 'member.enabled',
      actor_user_id: OWNER_ID,
      entity: 'membership',
      entity_id: EMPLOYEE_ID,
      before: { status: 'disabled', role: 'employee' },
      after: { status: 'active', role: 'employee' },
    });
    expect(entries[0]?.at).toBeInstanceOf(Date);
  });

  it('answers 200 for an already active member and writes no audit entry', async () => {
    // AC-6
    await seedTeam('active');

    const first = await enable(EMPLOYEE_ID);
    const second = await enable(EMPLOYEE_ID);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ userId: EMPLOYEE_ID, status: 'active' });
    expect(await audit()).toEqual([]);
  });

  it('writes one audit entry when a disable is followed by two enables', async () => {
    // AC-6
    await seedTeam('active');
    await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, {
      body: { status: 'disabled' },
    });
    await enable(EMPLOYEE_ID);
    await enable(EMPLOYEE_ID);

    expect((await audit()).map((entry) => entry.action)).toEqual([
      'member.disabled',
      'member.enabled',
    ]);
  });

  it('answers 404 MEMBER_NOT_FOUND for a member of another tenant and leaves it alone', async () => {
    // AC-7
    await seedTeam();
    await ctx
      .testDb()
      .client.query(
        `update memberships set status = 'disabled' where tenant_id = $1 and user_id = $2`,
        [ctx.otherTenantId(), OTHER_OWNER_ID],
      );

    const response = await enable(OTHER_OWNER_ID);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(await rowOf(ctx.otherTenantId(), OTHER_OWNER_ID)).toEqual({
      role: 'owner',
      status: 'disabled',
    });
    expect(await audit()).toEqual([]);
  });

  it('answers 403 FORBIDDEN to an employee and changes nothing', async () => {
    // AC-8
    await seedTeam('active');
    await ctx.addMember({
      tenantId: ctx.tenantId(),
      userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3305',
      role: 'employee',
      status: 'disabled',
    });

    const response = await enable('3f2504e0-4f89-41d3-9a0c-0305e82c3305', EMPLOYEE_ID);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'members.manage' });
    expect(await rowOf(ctx.tenantId(), '3f2504e0-4f89-41d3-9a0c-0305e82c3305')).toEqual({
      role: 'employee',
      status: 'disabled',
    });
    expect(await audit()).toEqual([]);
  });
});
