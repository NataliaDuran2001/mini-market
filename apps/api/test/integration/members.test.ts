import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OTHER_OWNER_ID, OWNER_ID, useAccessApp } from '../access-fixture';

const SECOND_OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';

interface AuditRow {
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

describe('members of a tenant', () => {
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
  const audit = async () =>
    (
      await ctx
        .testDb()
        .client.query<AuditRow>(
          'select tenant_id, actor_user_id, action, entity, entity_id, before, after from audit_log order by at, id',
        )
    ).rows;
  const statusOf = async (tenantId: string, userId: string) =>
    (
      await ctx
        .testDb()
        .client.query<{ role: string; status: string }>(
          'select role, status from memberships where tenant_id = $1 and user_id = $2',
          [tenantId, userId],
        )
    ).rows[0];
  const seedTeam = async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
  };

  describe('GET /api/v1/members', () => {
    it('lists the members of the tenant of the owner and nobody else', async () => {
      await seedTeam();

      const response = await call('get', '/api/v1/members', OWNER_ID);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(2);
      expect(response.body.items).toEqual(
        expect.arrayContaining([
          { userId: EMPLOYEE_ID, email: expect.any(String), role: 'employee', status: 'active' },
          { userId: OWNER_ID, email: expect.any(String), role: 'owner', status: 'active' },
        ]),
      );
    });

    it('is closed to employees', async () => {
      await seedTeam();
      const response = await call('get', '/api/v1/members', EMPLOYEE_ID);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'members.manage' });
    });
  });

  describe('PATCH /api/v1/members/:userId with a role', () => {
    it('changes the role and writes the audit entry', async () => {
      await seedTeam();

      const response = await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, {
        body: { role: 'owner' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId: EMPLOYEE_ID, role: 'owner', status: 'active' });
      expect(await statusOf(ctx.tenantId(), EMPLOYEE_ID)).toEqual({
        role: 'owner',
        status: 'active',
      });
      expect(await audit()).toEqual([
        {
          tenant_id: ctx.tenantId(),
          actor_user_id: OWNER_ID,
          action: 'member.role_changed',
          entity: 'membership',
          entity_id: EMPLOYEE_ID,
          before: { role: 'employee' },
          after: { role: 'owner' },
        },
      ]);
    });

    it('does nothing and audits nothing when the role is already that one', async () => {
      await seedTeam();
      const response = await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, {
        body: { role: 'employee' },
      });
      expect(response.status).toBe(200);
      expect(await audit()).toEqual([]);
    });

    it('keeps the last active owner: demoting them answers 409 LAST_OWNER', async () => {
      await seedTeam();

      const response = await call('patch', `/api/v1/members/${OWNER_ID}`, OWNER_ID, {
        body: { role: 'employee' },
      });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'LAST_OWNER' });
      expect(await statusOf(ctx.tenantId(), OWNER_ID)).toEqual({ role: 'owner', status: 'active' });
    });

    it('lets an owner step down when another active owner remains', async () => {
      await seedTeam();
      await ctx.addMember({ tenantId: ctx.tenantId(), userId: SECOND_OWNER_ID, role: 'owner' });

      const response = await call('patch', `/api/v1/members/${OWNER_ID}`, OWNER_ID, {
        body: { role: 'employee' },
      });

      expect(response.status).toBe(200);
      expect(await statusOf(ctx.tenantId(), OWNER_ID)).toEqual({
        role: 'employee',
        status: 'active',
      });
    });

    it('is closed to employees and leaves the role alone', async () => {
      await seedTeam();
      const response = await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, EMPLOYEE_ID, {
        body: { role: 'owner' },
      });
      expect(response.status).toBe(403);
      expect(await statusOf(ctx.tenantId(), EMPLOYEE_ID)).toEqual({
        role: 'employee',
        status: 'active',
      });
    });

    it('never reaches a member of another tenant, even when its id is named on purpose', async () => {
      // docs/05-security.md: tenant isolation, wrong id on purpose
      await seedTeam();

      const response = await call('patch', `/api/v1/members/${OTHER_OWNER_ID}`, OWNER_ID, {
        body: { role: 'employee' },
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'MEMBER_NOT_FOUND' });
      expect(await statusOf(ctx.otherTenantId(), OTHER_OWNER_ID)).toEqual({
        role: 'owner',
        status: 'active',
      });
      expect(await audit()).toEqual([]);
    });
  });

  describe('PATCH /api/v1/members/:userId with status disabled', () => {
    it('disables the member, refuses them from then on and audits member.disabled', async () => {
      // AC-5
      await seedTeam();

      const response = await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, {
        body: { status: 'disabled' },
      });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ userId: EMPLOYEE_ID, status: 'disabled' });
      expect(await statusOf(ctx.tenantId(), EMPLOYEE_ID)).toEqual({
        role: 'employee',
        status: 'disabled',
      });
      const entries = await audit();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: 'member.disabled',
        actor_user_id: OWNER_ID,
        entity_id: EMPLOYEE_ID,
        before: { status: 'active', role: 'employee' },
        after: { status: 'disabled', role: 'employee' },
      });

      const afterwards = await call('get', '/api/v1/tenant', EMPLOYEE_ID);
      expect(afterwards.status).toBe(403);
      expect(afterwards.body).toMatchObject({ code: 'NOT_A_MEMBER' });
    });

    it('is idempotent: disabling a disabled member audits once', async () => {
      await seedTeam();
      const body = { status: 'disabled' };
      await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, { body });
      const again = await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, { body });
      expect(again.status).toBe(200);
      expect(await audit()).toHaveLength(1);
    });

    it('keeps the last active owner: disabling them answers 409 LAST_OWNER', async () => {
      await seedTeam();
      const response = await call('patch', `/api/v1/members/${OWNER_ID}`, OWNER_ID, {
        body: { status: 'disabled' },
      });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: 'LAST_OWNER' });
    });

    it('keeps the row: a disabled member is never deleted', async () => {
      await seedTeam();
      await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, {
        body: { status: 'disabled' },
      });
      const { rows } = await ctx.testDb().client.query('select 1 from memberships');
      expect(rows).toHaveLength(3);
    });
  });

  describe('validation', () => {
    it('answers 400 for a body that names both or neither of role and status, or something else', async () => {
      await seedTeam();
      const url = `/api/v1/members/${EMPLOYEE_ID}`;
      for (const body of [
        {},
        { role: 'owner', status: 'disabled' },
        { role: 'owner', status: 'active' },
        { status: 'deleted' },
        { role: 'admin' },
        { role: 'owner', extra: true },
      ]) {
        const response = await call('patch', url, OWNER_ID, { body });
        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      }
      const badId = await call('patch', '/api/v1/members/not-a-uuid', OWNER_ID, {
        body: { role: 'owner' },
      });
      expect(badId.status).toBe(400);
    });

    it('answers 404 MEMBER_NOT_FOUND for a user who is not a member at all', async () => {
      await seedTeam();
      const response = await call(
        'patch',
        '/api/v1/members/3f2504e0-4f89-41d3-9a0c-0305e82c3399',
        OWNER_ID,
        { body: { role: 'owner' } },
      );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    });
  });

  describe('audit log', () => {
    it('is append-only: the database rejects UPDATE and DELETE', async () => {
      // hard rule 3: ledgers are immutable
      await seedTeam();
      await call('patch', `/api/v1/members/${EMPLOYEE_ID}`, OWNER_ID, { body: { role: 'owner' } });
      const { client } = ctx.testDb();

      await expect(client.query("update audit_log set action = 'x'")).rejects.toThrow(
        /audit_log is append-only: UPDATE/,
      );
      await expect(client.query('delete from audit_log')).rejects.toThrow(
        /audit_log is append-only: DELETE/,
      );
      expect(await audit()).toHaveLength(1);
    });
  });
});
