import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OWNER_ID, TENANT_ID, useAccessApp } from '../access-fixture';

describe('POST /api/v1/auth/invitations', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];

  const invite = async (userId: string, body: unknown, tenant: string = TENANT_ID) => {
    const req = request(server())
      .post('/api/v1/auth/invitations')
      .set('Authorization', await ctx.bearer({ sub: userId }));
    return (tenant ? req.set('X-Tenant-Id', tenant) : req).send(body as object);
  };
  const employeeBody = { email: 'x@example.com', role: 'employee' };
  const pending = async () =>
    (await ctx.testDb().client.query('select 1 from invitations')).rows.length;

  it('lets the owner invite an employee: 202, invite sent, pending row stored', async () => {
    // AC-4
    ctx.roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');

    const response = await invite(OWNER_ID, {
      email: ' New.Employee@Example.com ',
      role: 'employee',
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ email: 'new.employee@example.com', role: 'employee' });
    expect(response.body).not.toHaveProperty('delivery'); // never reveal whether an account exists
    expect(ctx.admin.invites).toHaveLength(1);
    expect(ctx.admin.invites[0]?.email).toBe('new.employee@example.com');
    expect(ctx.admin.invites[0]?.redirectTo).toMatch(
      /^http:\/\/localhost:5173\/accept-invitation\?token=[\w-]{43}$/,
    );
    const { rows } = await ctx.testDb().client.query<{
      tenant_id: string;
      email: string;
      role: string;
      invited_by: string;
      token_hash: string;
      consumed_at: string | null;
    }>('select tenant_id, email, role, invited_by, token_hash, consumed_at from invitations');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: TENANT_ID,
      email: 'new.employee@example.com',
      role: 'employee',
      invited_by: OWNER_ID,
      consumed_at: null,
    });
    const rawToken = new URL(ctx.admin.invites[0]?.redirectTo ?? '').searchParams.get('token');
    expect(rows[0]?.token_hash).not.toBe(rawToken); // only the hash is stored
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers 403 FORBIDDEN to an employee and sends nothing', async () => {
    // AC-5
    ctx.roles.set(`${TENANT_ID}:${EMPLOYEE_ID}`, 'employee');

    const response = await invite(EMPLOYEE_ID, employeeBody);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'members.manage' },
    });
    expect(ctx.admin.invites).toEqual([]);
    expect(await pending()).toBe(0);
  });

  it('answers 403 NOT_A_MEMBER to a user outside the tenant', async () => {
    const response = await invite(OWNER_ID, employeeBody);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('answers 400 VALIDATION_ERROR for a bad body or a missing tenant header', async () => {
    ctx.roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');

    const badEmail = await invite(OWNER_ID, { email: 'nope', role: 'employee' });
    expect(badEmail.status).toBe(400);
    expect(badEmail.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect((await invite(OWNER_ID, { email: 'x@example.com', role: 'owner' })).status).toBe(400);
    const noTenant = await invite(OWNER_ID, employeeBody, '');
    expect(noTenant.status).toBe(400);
    expect(noTenant.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('requires authentication', async () => {
    // AC-1
    await request(server())
      .post('/api/v1/auth/invitations')
      .set('X-Tenant-Id', TENANT_ID)
      .send(employeeBody)
      .expect(401);
  });

  it('answers 502 INVITE_DELIVERY_FAILED when the email cannot be sent, keeping the invitation', async () => {
    ctx.roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');
    ctx.admin.fail = true;

    const response = await invite(OWNER_ID, employeeBody);

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ code: 'INVITE_DELIVERY_FAILED' });
    expect(JSON.stringify(response.body)).not.toContain('unexpected_failure');
    expect(await pending()).toBe(1); // the owner can send it again
  });
});
