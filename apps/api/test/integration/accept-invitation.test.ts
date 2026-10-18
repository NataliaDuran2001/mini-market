import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';

const INVITEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3310';
const INVITEE_EMAIL = 'new.employee@example.com';

describe('POST /api/v1/invitations/accept', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];

  /** The owner invites through the API; the token is read from the link the email would carry. */
  const inviteAndGetToken = async (email = INVITEE_EMAIL) => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await request(server())
      .post('/api/v1/auth/invitations')
      .set('Authorization', await ctx.bearer({ sub: OWNER_ID }))
      .set('X-Tenant-Id', ctx.tenantId())
      .send({ email, role: 'employee' })
      .expect(202);
    const link = ctx.admin.invites.at(-1)?.redirectTo ?? '';
    return new URL(link).searchParams.get('token') ?? '';
  };
  const accept = async (token: string, claims: { sub: string; email: string } = inviteeClaims()) =>
    request(server())
      .post('/api/v1/invitations/accept')
      .set('Authorization', await ctx.bearer(claims))
      .send({ token });
  const inviteeClaims = () => ({ sub: INVITEE_ID, email: INVITEE_EMAIL });
  const membership = async (userId: string) =>
    (
      await ctx
        .testDb()
        .client.query<{ role: string; status: string }>(
          'select role, status from memberships where tenant_id = $1 and user_id = $2',
          [ctx.tenantId(), userId],
        )
    ).rows[0];
  const invitationRow = async () =>
    (
      await ctx
        .testDb()
        .client.query<{ consumed_at: Date | null }>('select consumed_at from invitations')
    ).rows[0];

  it('creates the active membership with the invited role and consumes the invitation', async () => {
    // AC-4
    const token = await inviteAndGetToken();

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tenantId: ctx.tenantId(), role: 'employee' });
    expect(await membership(INVITEE_ID)).toEqual({ role: 'employee', status: 'active' });
    expect((await invitationRow())?.consumed_at).not.toBeNull();
    const audit = await ctx
      .testDb()
      .client.query<{ action: string; actor_user_id: string }>(
        "select action, actor_user_id from audit_log where action = 'member.joined'",
      );
    expect(audit.rows).toEqual([{ action: 'member.joined', actor_user_id: INVITEE_ID }]);
  });

  it('lets the new member work in the tenant right away', async () => {
    const token = await inviteAndGetToken();
    await accept(token);

    const response = await request(server())
      .get('/api/v1/tenant')
      .set('Authorization', await ctx.bearer(inviteeClaims()))
      .set('X-Tenant-Id', ctx.tenantId());

    expect(response.status).toBe(200);
  });

  it('answers 409 INVITATION_ALREADY_USED the second time', async () => {
    // AC-4
    const token = await inviteAndGetToken();
    await accept(token).then((first) => expect(first.status).toBe(200));

    const second = await accept(token);

    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'INVITATION_ALREADY_USED' });
  });

  it('lets exactly one of two simultaneous requests win', async () => {
    const token = await inviteAndGetToken();

    const results = await Promise.all([accept(token), accept(token)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows } = await ctx
      .testDb()
      .client.query('select 1 from memberships where user_id = $1', [INVITEE_ID]);
    expect(rows).toHaveLength(1);
  });

  it('answers 404 INVITATION_NOT_FOUND for an unknown token', async () => {
    await inviteAndGetToken();
    const response = await accept('x'.repeat(43));
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'INVITATION_NOT_FOUND' });
  });

  it('answers 410 INVITATION_EXPIRED after seven days and creates nothing', async () => {
    const token = await inviteAndGetToken();
    await ctx
      .testDb()
      .client.exec("update invitations set expires_at = now() - interval '1 minute'");

    const response = await accept(token);

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({ code: 'INVITATION_EXPIRED' });
    expect(await membership(INVITEE_ID)).toBeUndefined();
  });

  it('refuses a forwarded link: only the invited email may use it, and the answer reveals nothing', async () => {
    const token = await inviteAndGetToken();

    const response = await accept(token, { sub: EMPLOYEE_ID, email: 'someone.else@example.com' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'INVITATION_NOT_FOUND' });
    expect(await membership(EMPLOYEE_ID)).toBeUndefined();
    expect((await invitationRow())?.consumed_at).toBeNull(); // the real invitee can still use it
    expect((await accept(token)).status).toBe(200);
  });

  it('tells a stranger nothing about a used or expired invitation: still 404', async () => {
    const used = await inviteAndGetToken();
    await accept(used).then((first) => expect(first.status).toBe(200));
    const stranger = { sub: EMPLOYEE_ID, email: 'someone.else@example.com' };
    expect((await accept(used, stranger)).status).toBe(404);

    const expired = await inviteAndGetToken('other.person@example.com');
    await ctx
      .testDb()
      .client.exec(
        "update invitations set expires_at = now() - interval '1 minute' where email = 'other.person@example.com'",
      );
    expect((await accept(expired, stranger)).status).toBe(404);
  });

  it('matches the invited email ignoring case', async () => {
    const token = await inviteAndGetToken();
    const response = await accept(token, { sub: INVITEE_ID, email: 'New.Employee@Example.com' });
    expect(response.status).toBe(200);
  });

  it('does not demote an owner who uses an employee invitation', async () => {
    const token = await inviteAndGetToken(INVITEE_EMAIL);
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: INVITEE_ID, role: 'owner' });

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: 'owner' });
    expect(await membership(INVITEE_ID)).toEqual({ role: 'owner', status: 'active' });
  });

  it('reactivates a disabled member with the invited role', async () => {
    const token = await inviteAndGetToken();
    await ctx.addMember({
      tenantId: ctx.tenantId(),
      userId: INVITEE_ID,
      role: 'owner',
      status: 'disabled',
    });

    const response = await accept(token);

    expect(response.status).toBe(200);
    expect(await membership(INVITEE_ID)).toEqual({ role: 'employee', status: 'active' });
  });

  it('answers 400 for a missing or too short token, and 401 without a session', async () => {
    await inviteAndGetToken();
    expect((await accept('short')).status).toBe(400);
    await request(server())
      .post('/api/v1/invitations/accept')
      .send({ token: 'x'.repeat(43) })
      .expect(401);
  });
});

describe('GET /api/v1/me/tenants', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const tenantsOf = async (userId: string) =>
    request(server())
      .get('/api/v1/me/tenants')
      .set('Authorization', await ctx.bearer({ sub: userId }));

  it('lists the businesses where the caller is an active member, with their role', async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OWNER_ID, role: 'employee' });

    const response = await tenantsOf(OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      { tenantId: ctx.otherTenantId(), slug: 'luna', name: 'Business luna', role: 'employee' },
      { tenantId: ctx.tenantId(), slug: 'sol', name: 'Business sol', role: 'owner' },
    ]);
  });

  it('leaves out disabled memberships and the memberships of other people', async () => {
    await ctx.addMember({
      tenantId: ctx.tenantId(),
      userId: OWNER_ID,
      role: 'owner',
      status: 'disabled',
    });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: EMPLOYEE_ID, role: 'employee' });

    const response = await tenantsOf(OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('needs no X-Tenant-Id and answers 401 without a session', async () => {
    await request(server()).get('/api/v1/me/tenants').expect(401);
  });
});
