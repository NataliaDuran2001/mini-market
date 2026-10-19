import {
  expenseSchema,
  listExpensesResponseSchema,
  listRecurringExpensesResponseSchema,
  recurringExpenseSchema,
} from '@mini-market/contracts/payables';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPLOYEE_ID, OTHER_OWNER_ID, OWNER_ID, useAccessApp } from '../access-fixture';
import { seedCatalogIds } from '../helpers/catalog-ids';
import type { CatalogIds } from '../helpers/catalog-ids';

const bs = (amount: number) => amount * 100;
const UNKNOWN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3999';

describe('expenses over HTTP', () => {
  const ctx = useAccessApp();
  let ids: CatalogIds;
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const call = async (
    method: 'get' | 'post' | 'patch',
    path: string,
    userId: string,
    body?: object,
  ) => {
    const agent = request(server());
    const req = agent[method](path)
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', ctx.tenantId());
    return body ? req.send(body) : req;
  };
  const asOwner = (method: 'get' | 'post' | 'patch', path: string, body?: object) =>
    call(method, path, OWNER_ID, body);
  const newExpense = (extra: object = {}) =>
    asOwner('post', '/api/v1/expenses', {
      expenseCategoryId: ids.electricity,
      name: 'Luz',
      amountCentavos: bs(300),
      period: '2026-10',
      ...extra,
    });

  beforeEach(async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
    ids = await seedCatalogIds(ctx.testDb(), ctx.tenantId());
  });

  it('generates the recurring expense of a month the first time it is viewed, never twice', async () => {
    // AC-1
    const template = await asOwner('post', '/api/v1/recurring-expenses', {
      expenseCategoryId: ids.rent,
      name: 'Alquiler',
      amountCentavos: bs(1500),
      dayOfMonthDue: 5,
      startsPeriod: '2026-10',
    });
    expect(template.status).toBe(201);
    expect(recurringExpenseSchema.safeParse(template.body).success).toBe(true);

    const first = await asOwner('get', '/api/v1/expenses?period=2026-11');
    const second = await asOwner('get', '/api/v1/expenses?period=2026-11');

    expect(first.status).toBe(200);
    expect(listExpensesResponseSchema.safeParse(first.body).success).toBe(true);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]).toMatchObject({
      name: 'Alquiler',
      period: '2026-11',
      dueDate: '2026-11-05',
      amountCentavos: bs(1500),
      status: 'pending',
      paidCentavos: 0,
      balanceCentavos: bs(1500),
      recurringExpenseId: template.body.id,
    });
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual([
      first.body.items[0].id,
    ]);
    expect(first.body.totals).toEqual({
      accruedCentavos: bs(1500),
      paidCentavos: 0,
      pendingCentavos: bs(1500),
    });
  });

  it('pays in two steps: partial, paid, and 400 above the balance', async () => {
    // AC-2
    const expense = (await newExpense()).body;
    const pay = (amountCentavos: number) =>
      asOwner('post', `/api/v1/expenses/${expense.id}/payments`, {
        amountCentavos,
        paymentMethodId: ids.cash,
        paidOn: '2026-10-20',
      });

    const partial = await pay(bs(100));
    expect(partial.status).toBe(201);
    expect(expenseSchema.safeParse(partial.body).success).toBe(true);
    expect(partial.body).toMatchObject({
      status: 'partial',
      paidCentavos: bs(100),
      balanceCentavos: bs(200),
    });
    const tooMuch = await pay(bs(250));
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body).toMatchObject({
      code: 'PAYMENT_EXCEEDS_BALANCE',
      details: { balanceCentavos: bs(200) },
    });
    const paid = await pay(bs(200));
    expect(paid.body).toMatchObject({ status: 'paid', paidCentavos: bs(300), balanceCentavos: 0 });
  });

  it('refuses to change the amount of a paid expense with 409', async () => {
    // AC-3
    const expense = (await newExpense()).body;
    await asOwner('post', `/api/v1/expenses/${expense.id}/payments`, {
      amountCentavos: bs(300),
      paymentMethodId: ids.cash,
    });

    const response = await asOwner('patch', `/api/v1/expenses/${expense.id}`, {
      amountCentavos: bs(400),
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'EXPENSE_PAID' });
  });

  it('lets the owner edit an unpaid expense and keeps a one-off in the period chosen', async () => {
    // S5
    const expense = (await newExpense({ dueDate: '2026-11-02', notes: ' nota ' })).body;
    expect(expense).toMatchObject({ period: '2026-10', dueDate: '2026-11-02', notes: 'nota' });

    const updated = await asOwner('patch', `/api/v1/expenses/${expense.id}`, {
      amountCentavos: bs(320),
    });
    const october = await asOwner('get', '/api/v1/expenses?period=2026-10');

    expect(updated.body.amountCentavos).toBe(bs(320));
    expect(october.body.items).toHaveLength(1);
    expect(october.body.totals.accruedCentavos).toBe(bs(320));
  });

  it('manages the templates: list, change and switch off', async () => {
    const created = (
      await asOwner('post', '/api/v1/recurring-expenses', {
        expenseCategoryId: ids.rent,
        name: 'Alquiler',
        amountCentavos: bs(1500),
        dayOfMonthDue: 5,
        startsPeriod: '2026-10',
      })
    ).body;

    const patched = await asOwner('patch', `/api/v1/recurring-expenses/${created.id}`, {
      active: false,
      endsPeriod: '2027-01',
    });
    const list = await asOwner('get', '/api/v1/recurring-expenses');

    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ active: false, endsPeriod: '2027-01' });
    expect(listRecurringExpensesResponseSchema.safeParse(list.body).success).toBe(true);
    expect(list.body.items).toHaveLength(1);
    const noExpense = await asOwner('get', '/api/v1/expenses?period=2026-11');
    expect(noExpense.body.items).toHaveLength(0);
  });

  it('answers 403 naming expenses.manage to an employee on every endpoint', async () => {
    // AC-4
    const expense = (await newExpense()).body;
    const template = (
      await asOwner('post', '/api/v1/recurring-expenses', {
        expenseCategoryId: ids.rent,
        name: 'Alquiler',
        amountCentavos: bs(1500),
        dayOfMonthDue: 5,
        startsPeriod: '2026-10',
      })
    ).body;
    const body = {
      expenseCategoryId: ids.rent,
      name: 'X',
      amountCentavos: 100,
      period: '2026-10',
    };
    const responses = [
      await call('get', '/api/v1/expenses?period=2026-10', EMPLOYEE_ID),
      await call('post', '/api/v1/expenses', EMPLOYEE_ID, body),
      await call('patch', `/api/v1/expenses/${expense.id}`, EMPLOYEE_ID, { name: 'X' }),
      await call('post', `/api/v1/expenses/${expense.id}/payments`, EMPLOYEE_ID, {
        amountCentavos: 1,
        paymentMethodId: ids.cash,
      }),
      await call('get', '/api/v1/recurring-expenses', EMPLOYEE_ID),
      await call('post', '/api/v1/recurring-expenses', EMPLOYEE_ID, {
        ...body,
        dayOfMonthDue: 5,
        startsPeriod: '2026-10',
      }),
      await call('patch', `/api/v1/recurring-expenses/${template.id}`, EMPLOYEE_ID, { name: 'X' }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'expenses.manage' });
    }
    const stored = await ctx.testDb().client.query('select name from expenses');
    expect(stored.rows).toEqual([{ name: 'Luz' }]);
  });

  it('rejects invalid input with 400 and a malformed id with 400', async () => {
    const expense = (await newExpense()).body;
    expect((await newExpense({ amountCentavos: 0 })).status).toBe(400);
    expect((await newExpense({ amountCentavos: 10.5 })).status).toBe(400);
    expect((await newExpense({ period: '2026-13' })).status).toBe(400);
    expect((await newExpense({ expenseCategoryId: UNKNOWN_ID })).status).toBe(400);
    expect((await asOwner('get', '/api/v1/expenses')).status).toBe(400);
    expect((await asOwner('get', '/api/v1/expenses?period=2026-1')).status).toBe(400);
    expect((await asOwner('patch', '/api/v1/expenses/not-a-uuid', { name: 'X' })).status).toBe(400);
    expect((await asOwner('patch', `/api/v1/expenses/${expense.id}`, {})).status).toBe(400);
    const badPayment = await asOwner('post', `/api/v1/expenses/${expense.id}/payments`, {
      amountCentavos: 100,
      paymentMethodId: ids.credit,
    });
    expect(badPayment.status).toBe(400);
    expect(badPayment.body).toMatchObject({ code: 'INVALID_CATALOG_ITEM' });
    const schedule = await asOwner('post', '/api/v1/recurring-expenses', {
      expenseCategoryId: ids.rent,
      name: 'X',
      amountCentavos: 100,
      dayOfMonthDue: 5,
      startsPeriod: '2026-10',
      endsPeriod: '2026-01',
    });
    expect(schedule.status).toBe(400);
    expect(schedule.body).toMatchObject({ code: 'INVALID_SCHEDULE' });
  });

  it('answers 404 for an unknown expense and for an expense of another tenant', async () => {
    const otherIds = await seedCatalogIds(ctx.testDb(), ctx.otherTenantId());
    const foreign = await ctx.testDb().client.query<{ id: string }>(
      `insert into expenses (tenant_id, expense_category_id, name, amount_centavos, period_year, period_month, created_by)
       values ($1, $2, 'Ajeno', 100, 2026, 10, $3) returning id`,
      [ctx.otherTenantId(), otherIds.rent, OTHER_OWNER_ID],
    );
    const foreignId = foreign.rows[0]?.id ?? '';

    for (const id of [UNKNOWN_ID, foreignId]) {
      expect((await asOwner('patch', `/api/v1/expenses/${id}`, { name: 'X' })).status).toBe(404);
      const pay = await asOwner('post', `/api/v1/expenses/${id}/payments`, {
        amountCentavos: 1,
        paymentMethodId: ids.cash,
      });
      expect(pay.status).toBe(404);
    }
    expect((await asOwner('get', '/api/v1/expenses?period=2026-10')).body.items).toHaveLength(0);
  });
});
