import { apiErrorSchema } from '@mini-market/contracts/common';
import {
  customerSchema,
  customerStatementSchema,
  listCustomersResponseSchema,
  listReceivablesResponseSchema,
  registerCollectionResponseSchema,
} from '@mini-market/contracts/receivables';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OWNER_ID, OTHER_OWNER_ID, useAccessApp } from '../access-fixture';

// The routes of the receivables module behind the real guards of the access module.
describe('customers and receivables endpoints (S6)', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'post' | 'patch',
    path: string,
    userId: string,
    options: { body?: object; tenant?: string } = {},
  ) => {
    const agent = request(server());
    const scoped = agent[method](path)
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', options.tenant ?? ctx.tenantId());
    return options.body ? scoped.send(options.body) : scoped;
  };
  const seedPeople = async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
  };
  const newCustomer = async (body: object = { name: 'Doña Rosa' }, userId = OWNER_ID) => {
    const response = await call('post', '/api/v1/customers', userId, { body });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string };
  };
  const switchCreditSales = (enabled: boolean) =>
    ctx
      .testDb()
      .client.query(
        `update tenants set settings = jsonb_set(settings, '{modules,credit_sales}', '${enabled}'::jsonb) where id = $1`,
        [ctx.tenantId()],
      );
  /** A charge as the sales module will leave it (#57); written straight into the ledger. */
  const chargeDirectly = async (customerId: string, amountCentavos: number, saleId: string) => {
    await ctx.testDb().client.query(
      `insert into credit_ledger (tenant_id, customer_id, kind, amount_centavos, reference_type, reference_id, occurred_at, created_by)
         values ($1, $2, 'charge', $3, 'sale', $4, now(), $5)`,
      [ctx.tenantId(), customerId, amountCentavos, saleId, OWNER_ID],
    );
  };
  const SALE_1 = '00000000-0000-4000-8000-000000000001';
  const SALE_2 = '00000000-0000-4000-8000-000000000002';

  it('creates, lists and edits customers and validates the shapes against the contract', async () => {
    await seedPeople();

    const created = await newCustomer({ name: 'Doña Rosa', phone: '70011223' });
    const edited = await call('patch', `/api/v1/customers/${created.id}`, EMPLOYEE_ID, {
      body: { notes: 'paga los viernes' },
    });
    const listed = await call('get', '/api/v1/customers?q=rosa', EMPLOYEE_ID);

    expect(edited.status).toBe(200);
    expect(customerSchema.safeParse(edited.body).success).toBe(true);
    expect(listed.status).toBe(200);
    expect(listCustomersResponseSchema.safeParse(listed.body).success).toBe(true);
    expect(listed.body.items).toMatchObject([
      {
        name: 'Doña Rosa',
        phone: '70011223',
        notes: 'paga los viernes',
        creditLimitCentavos: null,
      },
    ]);
  });

  it('answers the statement with the balance and three lines after charges 50 and 30 and a collection of 20', async () => {
    // AC-1
    await seedPeople();
    const { id } = await newCustomer();
    await chargeDirectly(id, 5_000, SALE_1);
    await chargeDirectly(id, 3_000, SALE_2);

    const collected = await call('post', `/api/v1/customers/${id}/collections`, EMPLOYEE_ID, {
      body: { amountCentavos: 2_000, method: 'cash' },
    });
    const statement = await call('get', `/api/v1/customers/${id}/statement`, OWNER_ID);

    expect(collected.status).toBe(201);
    expect(registerCollectionResponseSchema.safeParse(collected.body).success).toBe(true);
    expect(collected.body.balanceCentavos).toBe(6_000);
    expect(statement.status).toBe(200);
    expect(customerStatementSchema.safeParse(statement.body).success).toBe(true);
    expect(statement.body.balanceCentavos).toBe(6_000);
    expect(
      statement.body.lines.map((line: { kind: string; amountCentavos: number }) => [
        line.kind,
        line.amountCentavos,
      ]),
    ).toEqual([
      ['charge', 5_000],
      ['charge', 3_000],
      ['payment', -2_000],
    ]);
  });

  it('lists the balances biggest debt first with the total pending', async () => {
    await seedPeople();
    const rosa = await newCustomer({ name: 'Rosa' });
    const pedro = await newCustomer({ name: 'Pedro' });
    await chargeDirectly(rosa.id, 2_000, SALE_1);
    await chargeDirectly(pedro.id, 9_000, SALE_2);

    const response = await call('get', '/api/v1/receivables', EMPLOYEE_ID);

    expect(response.status).toBe(200);
    expect(listReceivablesResponseSchema.safeParse(response.body).success).toBe(true);
    expect(
      response.body.items.map((row: { customer: { name: string }; balanceCentavos: number }) => [
        row.customer.name,
        row.balanceCentavos,
      ]),
    ).toEqual([
      ['Pedro', 9_000],
      ['Rosa', 2_000],
    ]);
    expect(response.body.totalPendingCentavos).toBe(11_000);
  });

  it('answers 409 when a collection exceeds the balance', async () => {
    await seedPeople();
    const { id } = await newCustomer({ name: 'Rosa', creditLimitCentavos: 10_000 });
    await chargeDirectly(id, 1_000, SALE_1);

    const response = await call('post', `/api/v1/customers/${id}/collections`, OWNER_ID, {
      body: { amountCentavos: 5_000, method: 'cash' },
    });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.code).toBe('COLLECTION_EXCEEDS_BALANCE');
  });

  it('lets the owner manage the credit limit and refuses the employee with 403 naming the permission', async () => {
    // The web (#58) depends on this: the employee reads the limit but cannot write it.
    await seedPeople();
    const { id } = await newCustomer({ name: 'Rosa', creditLimitCentavos: 10_000 });

    const raised = await call('patch', `/api/v1/customers/${id}`, EMPLOYEE_ID, {
      body: { creditLimitCentavos: 999_999 },
    });
    const creating = await call('post', '/api/v1/customers', EMPLOYEE_ID, {
      body: { name: 'Otro', creditLimitCentavos: 5_000 },
    });
    const ownerEdit = await call('patch', `/api/v1/customers/${id}`, OWNER_ID, {
      body: { creditLimitCentavos: 20_000 },
    });
    const employeeView = await call('get', `/api/v1/customers/${id}/statement`, EMPLOYEE_ID);

    expect(raised.status).toBe(403);
    expect(raised.body).toMatchObject({ code: 'FORBIDDEN', permission: 'receivables.manage' });
    expect(creating.status).toBe(403);
    expect(ownerEdit.body.creditLimitCentavos).toBe(20_000);
    expect(employeeView.body.customer.creditLimitCentavos).toBe(20_000);
  });

  it('answers 403 MODULE_DISABLED on every endpoint while credit_sales is off', async () => {
    // AC-3
    await seedPeople();
    const { id } = await newCustomer();
    await switchCreditSales(false);
    const attempts = [
      ['get', '/api/v1/customers', undefined],
      ['post', '/api/v1/customers', { name: 'X' }],
      ['patch', `/api/v1/customers/${id}`, { name: 'Y' }],
      ['get', `/api/v1/customers/${id}/statement`, undefined],
      ['post', `/api/v1/customers/${id}/collections`, { amountCentavos: 1, method: 'cash' }],
      ['get', '/api/v1/receivables', undefined],
    ] as const;

    for (const userId of [OWNER_ID, EMPLOYEE_ID]) {
      for (const [method, path, body] of attempts) {
        const response = await call(method, path, userId, body ? { body } : {});
        expect(`${method} ${path} ${response.status}`).toMatch(/ 403$/);
        expect(response.body.code, `${method} ${path}`).toBe('MODULE_DISABLED');
      }
    }

    await switchCreditSales(true);
    expect((await call('get', '/api/v1/customers', OWNER_ID)).status).toBe(200);
  });

  it('answers 400 for a malformed id or body and 404 for an unknown customer', async () => {
    await seedPeople();

    const results = [
      await call('get', '/api/v1/customers/not-a-uuid/statement', OWNER_ID),
      await call('post', '/api/v1/customers', OWNER_ID, { body: { name: '' } }),
      await call('post', '/api/v1/customers', OWNER_ID, { body: { name: 'A', tenantId: 'x' } }),
      await call('get', `/api/v1/customers/${SALE_1}/statement`, OWNER_ID),
    ];

    expect(results.map((response) => response.status)).toEqual([400, 400, 400, 404]);
  });

  it('keeps tenants apart: a customer of another business is 404 and the header of a foreign tenant is 403', async () => {
    // AC-4 (the repository level isolation is proven in receivables-use-cases)
    await seedPeople();
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
    const own = await call('post', '/api/v1/customers', OTHER_OWNER_ID, {
      body: { name: 'Ajena' },
      tenant: ctx.otherTenantId(),
    });

    const seen = await call('get', `/api/v1/customers/${own.body.id}/statement`, OWNER_ID);
    const listed = await call('get', '/api/v1/customers', OWNER_ID);
    const strangerHeader = await call('get', '/api/v1/customers', OTHER_OWNER_ID);

    expect(seen.status).toBe(404);
    expect(listed.body.items).toEqual([]);
    expect(strangerHeader.status).toBe(403);
  });
});
