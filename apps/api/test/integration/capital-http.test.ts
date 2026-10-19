import { apiErrorSchema } from '@mini-market/contracts/common';
import {
  capitalSummarySchema,
  listCapitalMovementsResponseSchema,
  recordCapitalMovementResponseSchema,
} from '@mini-market/contracts/equity';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OWNER_ID, useAccessApp } from '../access-fixture';

// The routes of the equity module behind the real guards of the access module.
describe('capital endpoints (S8)', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'post',
    path: string,
    userId: string,
    options: { body?: object; tenant?: string } = {},
  ) => {
    const scoped = request(server())
      [method](path)
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', options.tenant ?? ctx.tenantId());
    return options.body ? scoped.send(options.body) : scoped;
  };
  const post = (body: object, userId = OWNER_ID) =>
    call('post', '/api/v1/capital/movements', userId, { body });
  const seedPeople = async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
  };

  it('answers the summary of the owner with contributed, withdrawn and net (contract parity)', async () => {
    // AC-1
    await seedPeople();
    await post({ kind: 'contribution', amountCentavos: 1_000_000 });
    await post({ kind: 'contribution', amountCentavos: 200_000 });
    await post({ kind: 'withdrawal', amountCentavos: 50_000 });

    const response = await call('get', '/api/v1/capital/summary', OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      contributedCentavos: 1_200_000,
      withdrawnCentavos: 50_000,
      netCentavos: 1_150_000,
    });
    expect(capitalSummarySchema.safeParse(response.body).success).toBe(true);
  });

  it('answers 200 with warning true for a withdrawal above the net capital, and stores it', async () => {
    // AC-2
    await seedPeople();
    await post({ kind: 'contribution', amountCentavos: 100_000 });

    const response = await post({ kind: 'withdrawal', amountCentavos: 150_000, note: 'retiro' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      kind: 'withdrawal',
      amountCentavos: 150_000,
      note: 'retiro',
      createdBy: OWNER_ID,
      warning: true,
    });
    expect(recordCapitalMovementResponseSchema.safeParse(response.body).success).toBe(true);
    const audit = await ctx
      .testDb()
      .client.query('select action from audit_log where action = $1', ['capital.recorded']);
    expect(audit.rows).toHaveLength(2);
    const summary = await call('get', '/api/v1/capital/summary', OWNER_ID);
    expect(summary.body.netCentavos).toBe(-50_000);
  });

  it('answers warning false for a withdrawal the capital covers', async () => {
    // AC-2
    await seedPeople();
    await post({ kind: 'contribution', amountCentavos: 100_000 });

    const response = await post({ kind: 'withdrawal', amountCentavos: 40_000 });

    expect(response.status).toBe(200);
    expect(response.body.warning).toBe(false);
  });

  it('answers 403 FORBIDDEN naming the permission to an employee on every capital endpoint', async () => {
    // AC-3
    await seedPeople();
    const attempts = [
      await post({ kind: 'contribution', amountCentavos: 100 }, EMPLOYEE_ID),
      await call('get', '/api/v1/capital/movements', EMPLOYEE_ID),
      await call('get', '/api/v1/capital/summary', EMPLOYEE_ID),
    ];

    for (const response of attempts) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN' });
      expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    }
    const stored = await ctx.testDb().client.query('select 1 from capital_movements');
    expect(stored.rows).toEqual([]);
  });

  it('answers 401 without a token and 403 NOT_A_MEMBER for the header of another business', async () => {
    // AC-3
    await seedPeople();
    await request(server())
      .get('/api/v1/capital/summary')
      .set('X-Tenant-Id', ctx.tenantId())
      .expect(401);
    const response = await call('get', '/api/v1/capital/summary', OWNER_ID, {
      tenant: ctx.otherTenantId(),
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('lists the movements newest first, paginated, matching the list contract', async () => {
    await seedPeople();
    await post({ kind: 'contribution', amountCentavos: 100, occurredOn: '2026-01-10' });
    await post({ kind: 'withdrawal', amountCentavos: 200, occurredOn: '2026-01-12' });
    await post({ kind: 'contribution', amountCentavos: 300, occurredOn: '2026-01-11' });

    const response = await call('get', '/api/v1/capital/movements?page=1&pageSize=2', OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(
      response.body.items.map((item: { amountCentavos: number }) => item.amountCentavos),
    ).toEqual([200, 300]);
    expect(listCapitalMovementsResponseSchema.safeParse(response.body).success).toBe(true);
  });

  it('does not show the movements of another business', async () => {
    // AC-4
    await seedPeople();
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OWNER_ID, role: 'owner' });
    await post({ kind: 'contribution', amountCentavos: 100 });
    await call('post', '/api/v1/capital/movements', OWNER_ID, {
      body: { kind: 'contribution', amountCentavos: 900 },
      tenant: ctx.otherTenantId(),
    });

    const mine = await call('get', '/api/v1/capital/movements', OWNER_ID);

    expect(mine.body.total).toBe(1);
    expect(mine.body.items[0].amountCentavos).toBe(100);
  });

  it.each([
    ['a decimal amount', { kind: 'contribution', amountCentavos: 10.5 }],
    ['a zero amount', { kind: 'contribution', amountCentavos: 0 }],
    ['an unknown kind', { kind: 'gift', amountCentavos: 10 }],
    ['an extra field', { kind: 'contribution', amountCentavos: 10, tenantId: 'x' }],
    [
      'a day that does not exist',
      { kind: 'contribution', amountCentavos: 10, occurredOn: '2026-02-30' },
    ],
  ])('answers 400 for %s and stores nothing', async (_label, body) => {
    await seedPeople();

    const response = await post(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    const stored = await ctx.testDb().client.query('select 1 from capital_movements');
    expect(stored.rows).toEqual([]);
  });

  it('has no route to edit or delete a movement', async () => {
    await seedPeople();
    const created = await post({ kind: 'contribution', amountCentavos: 100 });
    const id = created.body.id as string;

    for (const method of ['put', 'patch', 'delete'] as const) {
      const response = await request(server())
        [method](`/api/v1/capital/movements/${id}`)
        .set('Authorization', await ctx.bearer({ sub: OWNER_ID }))
        .set('X-Tenant-Id', ctx.tenantId());
      expect(response.status).toBe(404);
    }
  });
});
