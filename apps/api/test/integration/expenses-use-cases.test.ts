import { FixedClock, Money, Period } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { createExpense } from '../../src/modules/payables/application/create-expense';
import { createRecurringExpense } from '../../src/modules/payables/application/create-recurring-expense';
import { ensurePeriodGenerated } from '../../src/modules/payables/application/ensure-period-generated';
import { generateExpensesForPeriod } from '../../src/modules/payables/application/generate-expenses-for-period';
import { listExpenses } from '../../src/modules/payables/application/list-expenses';
import { listRecurringExpenses } from '../../src/modules/payables/application/list-recurring-expenses';
import { payExpense } from '../../src/modules/payables/application/pay-expense';
import { updateExpense } from '../../src/modules/payables/application/update-expense';
import { updateRecurringExpense } from '../../src/modules/payables/application/update-recurring-expense';
import { CatalogModuleLookup } from '../../src/modules/payables/infrastructure/catalog-lookup.adapter';
import { DrizzleExpenseRepository } from '../../src/modules/payables/infrastructure/drizzle-expense.repository';
import { DrizzleRecurringExpenseRepository } from '../../src/modules/payables/infrastructure/drizzle-recurring-expense.repository';
import { PAYABLES_PERMISSIONS } from '../../src/modules/payables/payables.permissions';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { seedCatalogIds } from '../helpers/catalog-ids';
import type { CatalogIds } from '../helpers/catalog-ids';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedTenant } from '../helpers/seed';
import { expectDbError, expectTenantIsolation } from '../isolation';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const UNKNOWN_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3999';
const bs = (amount: number) => amount * 100;

describe('expenses and recurring templates (S5, S9)', () => {
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  let ids: CatalogIds;
  let otherIds: CatalogIds;
  const expenses = new DrizzleExpenseRepository();
  const recurring = new DrizzleRecurringExpenseRepository();
  const catalog = new CatalogModuleLookup();
  const audit = new DrizzleAuditRepository();
  // 2026-10-15 14:00 UTC is October 15, 10:00 in La Paz.
  const clock = new FixedClock('2026-10-15T14:00:00Z');
  const deps = () => ({
    expenses,
    recurring,
    catalog,
    audit,
    clock,
    withTransaction: testDb.withTransaction,
  });
  const permissions = { permissions: PAYABLES_PERMISSIONS };
  const owner = (tenant = tenantId) => asOwner(tenant, { userId: OWNER_ID, ...permissions });
  const employee = () => asEmployee(tenantId, { userId: EMPLOYEE_ID, ...permissions });
  const must = <T>(result: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!result.ok) throw result.error;
    return result.value;
  };
  const errorCode = (result: { ok: boolean; error?: { code: string } }) =>
    result.ok ? 'ok' : result.error?.code;

  const rent = (extra: Record<string, unknown> = {}) => ({
    expenseCategoryId: ids.rent,
    name: 'Alquiler',
    amountCentavos: bs(1500),
    dayOfMonthDue: 5,
    startsPeriod: '2026-10',
    ...extra,
  });
  const view = async (period: string, filters: object = {}) =>
    must(await listExpenses(deps(), owner(), { period, ...filters }));
  const aSingleExpense = async (amountCentavos = bs(300), extra: object = {}) =>
    must(
      await createExpense(deps(), owner(), {
        expenseCategoryId: ids.electricity,
        name: 'Luz',
        amountCentavos,
        period: '2026-10',
        ...extra,
      }),
    );
  const auditActions = async () =>
    (
      await testDb.client.query<{
        action: string;
        actor_user_id: string;
        before: object | null;
        after: object;
      }>(
        "select action, actor_user_id, before, after from audit_log where action like 'expense.%' order by at, id",
      )
    ).rows;

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    tenantId = await seedTenant(testDb, { slug: 'sol' });
    otherTenantId = await seedTenant(testDb, { slug: 'luna' });
    ids = await seedCatalogIds(testDb, tenantId);
    otherIds = await seedCatalogIds(testDb, otherTenantId);
  });

  describe('generation of recurring expenses', () => {
    it('creates the expense of a viewed period on the due day and never twice', async () => {
      // AC-1
      must(await createRecurringExpense(deps(), owner(), rent()));

      const first = await view('2026-11');
      const second = await view('2026-11');

      expect(first.items).toHaveLength(1);
      expect(first.items[0]).toMatchObject({
        name: 'Alquiler',
        dueDate: '2026-11-05',
        status: 'pending',
        recurringExpenseId: expect.any(String),
      });
      expect(first.items[0]?.amount.toCentavos()).toBe(150000n);
      expect(first.items[0]?.period.toString()).toBe('2026-11');
      expect(second.items).toHaveLength(1);
      expect(second.items[0]?.id).toBe(first.items[0]?.id);
    });

    it('does not generate before the start, after the end or while inactive', async () => {
      // AC-1
      must(await createRecurringExpense(deps(), owner(), rent({ endsPeriod: '2026-12' })));
      must(
        await createRecurringExpense(
          deps(),
          owner(),
          rent({ name: 'Apagado', active: false, startsPeriod: '2026-01' }),
        ),
      );

      expect((await view('2026-09')).items).toHaveLength(0);
      expect((await view('2026-12')).items.map((item) => item.name)).toEqual(['Alquiler']);
      expect((await view('2027-01')).items).toHaveLength(0);
    });

    it('stays idempotent when generation runs on demand and from a view (the database index backs it)', async () => {
      // AC-1
      must(await createRecurringExpense(deps(), owner(), rent()));
      const period = Period.of(2026, 11);

      const runs = await Promise.all([
        generateExpensesForPeriod(deps(), owner(), period),
        generateExpensesForPeriod(deps(), owner(), period),
        listExpenses(deps(), owner(), { period: '2026-11' }),
      ]);

      expect(runs.every((run) => run.ok)).toBe(true);
      const rows = await testDb.client.query('select 1 from expenses');
      expect(rows.rows).toHaveLength(1);
      const again = must(await generateExpensesForPeriod(deps(), owner(), period));
      expect(again.created).toBe(0);
    });

    it('uses the last day of a shorter month for a late due day', async () => {
      must(await createRecurringExpense(deps(), owner(), rent({ dayOfMonthDue: 31 })));
      expect((await view('2026-11')).items[0]?.dueDate).toBe('2026-11-30');
    });

    it('keeps already generated expenses when the template changes, and uses the change later', async () => {
      const template = must(await createRecurringExpense(deps(), owner(), rent()));
      await view('2026-10');

      must(
        await updateRecurringExpense(deps(), owner(), template.id, { amountCentavos: bs(1800) }),
      );

      expect((await view('2026-10')).items[0]?.amount.toCentavos()).toBe(150000n);
      expect((await view('2026-11')).items[0]?.amount.toCentavos()).toBe(180000n);
    });

    it('rejects a template that ends before it starts, on create and on update', async () => {
      const created = await createRecurringExpense(
        deps(),
        owner(),
        rent({ startsPeriod: '2026-10', endsPeriod: '2026-09' }),
      );
      expect(errorCode(created)).toBe('INVALID_SCHEDULE');
      const template = must(await createRecurringExpense(deps(), owner(), rent()));
      const updated = await updateRecurringExpense(deps(), owner(), template.id, {
        endsPeriod: '2026-09',
      });
      expect(errorCode(updated)).toBe('INVALID_SCHEDULE');
      const cleared = must(
        await updateRecurringExpense(deps(), owner(), template.id, { endsPeriod: null }),
      );
      expect(cleared.endsPeriod).toBeNull();
    });

    it('lists the templates, answers 404 for another tenant template', async () => {
      const mine = must(await createRecurringExpense(deps(), owner(), rent()));
      const theirs = must(
        await createRecurringExpense(
          deps(),
          owner(otherTenantId),
          rent({ expenseCategoryId: otherIds.rent, name: 'Ajeno' }),
        ),
      );

      expect(must(await listRecurringExpenses(deps(), owner())).map((t) => t.id)).toEqual([
        mine.id,
      ]);
      const foreign = await updateRecurringExpense(deps(), owner(), theirs.id, { name: 'X' });
      expect(errorCode(foreign)).toBe('RECURRING_EXPENSE_NOT_FOUND');
    });
  });

  describe('accrual by period (S5)', () => {
    it('keeps an expense in the period it belongs to, whatever its due date', async () => {
      await aSingleExpense(bs(300), { dueDate: '2026-11-02' });
      await createExpense(deps(), owner(), {
        expenseCategoryId: ids.electricity,
        name: 'Luz de noviembre',
        amountCentavos: bs(100),
        period: '2026-11',
      });

      const october = await view('2026-10');

      expect(october.items.map((item) => item.name)).toEqual(['Luz']);
      expect(october.items[0]?.dueDate).toBe('2026-11-02');
      expect(october.totals.accrued.toCentavos()).toBe(30000n);
    });

    it('totals accrued, paid and pending of the period regardless of the filters', async () => {
      const luz = await aSingleExpense(bs(200));
      await aSingleExpense(bs(100), { name: 'Agua' });
      must(
        await payExpense(deps(), owner(), luz.id, {
          amountCentavos: bs(50),
          paymentMethodId: ids.cash,
        }),
      );

      const all = await view('2026-10');
      const pendingOnly = await view('2026-10', { status: 'pending' });
      const byCategory = await view('2026-10', { categoryId: ids.rent });

      expect(all.totals.accrued.toCentavos()).toBe(30000n);
      expect(all.totals.paid.toCentavos()).toBe(5000n);
      expect(all.totals.pending.toCentavos()).toBe(25000n);
      expect(pendingOnly.items.map((item) => item.name)).toEqual(['Agua']);
      expect(pendingOnly.totals.accrued.toCentavos()).toBe(30000n);
      expect(byCategory.items).toHaveLength(0);
    });

    it('does not move an expense to another period when it is paid later', async () => {
      const luz = await aSingleExpense(bs(200));
      must(
        await payExpense(deps(), owner(), luz.id, {
          amountCentavos: bs(200),
          paymentMethodId: ids.cash,
          paidOn: '2026-11-05',
        }),
      );
      expect((await view('2026-10')).items).toHaveLength(1);
      expect((await view('2026-11')).items).toHaveLength(0);
    });

    it('rejects a malformed period', async () => {
      const result = await listExpenses(deps(), owner(), { period: '2026-13' });
      expect(errorCode(result)).toBe('VALIDATION_ERROR');
    });
  });

  describe('payments', () => {
    it('goes pending, partial, paid, and refuses a payment above the balance', async () => {
      // AC-2
      const expense = await aSingleExpense(bs(300));
      const pay = (amountCentavos: number) =>
        payExpense(deps(), owner(), expense.id, { amountCentavos, paymentMethodId: ids.cash });

      const first = must(await pay(bs(100)));
      expect(first.status).toBe('partial');
      expect(first.paid.toCentavos()).toBe(10000n);
      const tooMuch = await pay(bs(250));
      expect(errorCode(tooMuch)).toBe('PAYMENT_EXCEEDS_BALANCE');
      const second = must(await pay(bs(200)));
      expect(second.status).toBe('paid');
      expect(errorCode(await pay(1))).toBe('PAYMENT_EXCEEDS_BALANCE');
    });

    it('records each payment with its method and date, defaulting to today in the tenant timezone', async () => {
      // AC-2
      const expense = await aSingleExpense(bs(300));
      await payExpense(deps(), owner(), expense.id, {
        amountCentavos: bs(100),
        paymentMethodId: ids.cash,
      });
      await payExpense(deps(), owner(), expense.id, {
        amountCentavos: bs(50),
        paymentMethodId: ids.transfer,
        paidOn: '2026-10-01',
      });

      const payments = await testDb.withTransaction(owner(), (tx) =>
        expenses.listPayments(tx, tenantId, expense.id),
      );

      expect(payments.map((p) => [p.amount.toCentavos(), p.paidAt, p.paymentMethodId])).toEqual([
        [10000n, '2026-10-15', ids.cash],
        [5000n, '2026-10-01', ids.transfer],
      ]);
      expect(payments.every((p) => p.createdBy === OWNER_ID)).toBe(true);
    });

    it('audits every payment with the actor', async () => {
      const expense = await aSingleExpense(bs(300));
      await payExpense(deps(), owner(), expense.id, {
        amountCentavos: bs(100),
        paymentMethodId: ids.cash,
      });
      const rows = await auditActions();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: 'expense.paid', actor_user_id: OWNER_ID });
      expect(rows[0]?.after).toMatchObject({ paymentCentavos: 10000, status: 'partial' });
    });

    it('refuses the credit method, an inactive or foreign method and an unknown expense', async () => {
      const expense = await aSingleExpense(bs(300));
      const pay = (paymentMethodId: string, id = expense.id) =>
        payExpense(deps(), owner(), id, { amountCentavos: bs(10), paymentMethodId });

      expect(errorCode(await pay(ids.credit))).toBe('INVALID_CATALOG_ITEM');
      expect(errorCode(await pay(otherIds.cash))).toBe('INVALID_CATALOG_ITEM');
      expect(errorCode(await pay(UNKNOWN_ID))).toBe('INVALID_CATALOG_ITEM');
      expect(errorCode(await pay(ids.cash, UNKNOWN_ID))).toBe('EXPENSE_NOT_FOUND');
      const stored = await testDb.client.query('select 1 from expense_payments');
      expect(stored.rows).toHaveLength(0);
    });

    it('cannot update or delete a stored payment as the API role', async () => {
      const expense = await aSingleExpense(bs(300));
      await payExpense(deps(), owner(), expense.id, {
        amountCentavos: bs(100),
        paymentMethodId: ids.cash,
      });
      const scope = { tenantId, events: [] };
      await expectDbError(
        testDb.withTransaction(scope, (tx) =>
          tx.execute(sql`update expense_payments set amount_centavos = 1`),
        ),
        /permission denied/,
      );
      await expectDbError(
        testDb.withTransaction(scope, (tx) => tx.execute(sql`delete from expense_payments`)),
        /permission denied/,
      );
    });
  });

  describe('changing an expense', () => {
    it('refuses to change the amount of a paid expense', async () => {
      // AC-3
      const expense = await aSingleExpense(bs(300));
      must(
        await payExpense(deps(), owner(), expense.id, {
          amountCentavos: bs(300),
          paymentMethodId: ids.cash,
        }),
      );
      const result = await updateExpense(deps(), owner(), expense.id, { amountCentavos: bs(400) });
      expect(errorCode(result)).toBe('EXPENSE_PAID');
      const unchanged = await view('2026-10');
      expect(unchanged.items[0]?.amount.toCentavos()).toBe(30000n);
    });

    it('changes the amount while unpaid, audits it, and never below what was paid', async () => {
      const expense = await aSingleExpense(bs(300));
      const raised = must(
        await updateExpense(deps(), owner(), expense.id, { amountCentavos: bs(350) }),
      );
      expect(raised.amount.toCentavos()).toBe(35000n);
      must(
        await payExpense(deps(), owner(), expense.id, {
          amountCentavos: bs(100),
          paymentMethodId: ids.cash,
        }),
      );

      const below = await updateExpense(deps(), owner(), expense.id, { amountCentavos: bs(90) });
      const equal = must(
        await updateExpense(deps(), owner(), expense.id, { amountCentavos: bs(100) }),
      );

      expect(errorCode(below)).toBe('AMOUNT_BELOW_PAID');
      expect(equal.status).toBe('paid');
      const rows = await auditActions();
      // The audit rows share the fixed clock instant, so compare as a set.
      const changes = rows.filter((row) => row.action === 'expense.amount_changed');
      expect(changes.map((row) => [row.before, row.after])).toEqual(
        expect.arrayContaining([
          [{ amountCentavos: 30000 }, { amountCentavos: 35000, status: 'pending' }],
          [{ amountCentavos: 35000 }, { amountCentavos: 10000, status: 'paid' }],
        ]),
      );
      expect(changes.every((row) => row.actor_user_id === OWNER_ID)).toBe(true);
    });

    it('changes name, due date, notes and category of a paid expense without touching the amount', async () => {
      const expense = await aSingleExpense(bs(300));
      must(
        await payExpense(deps(), owner(), expense.id, {
          amountCentavos: bs(300),
          paymentMethodId: ids.cash,
        }),
      );
      const updated = must(
        await updateExpense(deps(), owner(), expense.id, {
          name: 'Luz y agua',
          dueDate: null,
          notes: 'pagado en caja',
          expenseCategoryId: ids.rent,
          amountCentavos: bs(300),
        }),
      );
      expect(updated).toMatchObject({
        name: 'Luz y agua',
        dueDate: null,
        notes: 'pagado en caja',
        expenseCategoryId: ids.rent,
        status: 'paid',
      });
    });

    it('answers not found for an unknown id and for the expense of another tenant', async () => {
      const theirs = must(
        await createExpense(deps(), owner(otherTenantId), {
          expenseCategoryId: otherIds.rent,
          name: 'Ajeno',
          amountCentavos: bs(10),
          period: '2026-10',
        }),
      );
      expect(errorCode(await updateExpense(deps(), owner(), UNKNOWN_ID, { name: 'X' }))).toBe(
        'EXPENSE_NOT_FOUND',
      );
      expect(errorCode(await updateExpense(deps(), owner(), theirs.id, { name: 'X' }))).toBe(
        'EXPENSE_NOT_FOUND',
      );
      expect(
        errorCode(
          await payExpense(deps(), owner(), theirs.id, {
            amountCentavos: 1,
            paymentMethodId: ids.cash,
          }),
        ),
      ).toBe('EXPENSE_NOT_FOUND');
    });

    it('refuses an expense category of another tenant or unknown', async () => {
      const create = (expenseCategoryId: string) =>
        createExpense(deps(), owner(), {
          expenseCategoryId,
          name: 'X',
          amountCentavos: 100,
          period: '2026-10',
        });
      expect(errorCode(await create(otherIds.rent))).toBe('INVALID_CATALOG_ITEM');
      expect(errorCode(await create(UNKNOWN_ID))).toBe('INVALID_CATALOG_ITEM');
      expect(
        errorCode(
          await createRecurringExpense(deps(), owner(), rent({ expenseCategoryId: otherIds.rent })),
        ),
      ).toBe('INVALID_CATALOG_ITEM');
    });
  });

  describe('permissions', () => {
    it('forbids an employee every use case', async () => {
      // AC-4
      const expense = await aSingleExpense();
      const template = must(await createRecurringExpense(deps(), owner(), rent()));
      const calls = [
        listExpenses(deps(), employee(), { period: '2026-10' }),
        createExpense(deps(), employee(), {
          expenseCategoryId: ids.rent,
          name: 'X',
          amountCentavos: 100,
          period: '2026-10',
        }),
        updateExpense(deps(), employee(), expense.id, { name: 'X' }),
        payExpense(deps(), employee(), expense.id, {
          amountCentavos: 1,
          paymentMethodId: ids.cash,
        }),
        listRecurringExpenses(deps(), employee()),
        createRecurringExpense(deps(), employee(), rent()),
        updateRecurringExpense(deps(), employee(), template.id, { name: 'X' }),
        generateExpensesForPeriod(deps(), employee(), Period.of(2026, 11)),
      ];
      for (const result of await Promise.all(calls)) {
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error.code).toBe('FORBIDDEN');
        expect(!result.ok && result.error.details).toEqual({ permission: 'expenses.manage' });
      }
    });
  });

  describe('tenant isolation', () => {
    const period = Period.of(2026, 10);
    const newExpense = (categoryId: string, createdBy = OWNER_ID) => ({
      expenseCategoryId: categoryId,
      recurringExpenseId: null,
      name: 'Luz',
      amount: Money.fromCentavos(1000),
      period,
      dueDate: null,
      notes: null,
      createdBy,
    });

    it('isolates the expenses repository', async () => {
      // AC-5
      await expectTenantIsolation({
        tenantA: tenantId,
        tenantB: otherTenantId,
        seed: async (tenant) => {
          const category = tenant === tenantId ? ids.electricity : otherIds.electricity;
          await testDb.asAdmin({ tenantId: tenant, events: [] }, (tx) =>
            expenses.insert(tx, tenant, newExpense(category)),
          );
        },
        list: (scope) =>
          testDb.withTransaction(scope, (tx) =>
            expenses.listByPeriod(tx, scope?.tenantId ?? tenantId, period),
          ),
        insertFor: async (scope, tenant) => {
          const category = tenant === tenantId ? ids.electricity : otherIds.electricity;
          await testDb.withTransaction(scope, async (tx) => {
            await expenses.insert(tx, tenant, newExpense(category));
          });
        },
      });
    });

    it('isolates the recurring expenses repository', async () => {
      // AC-5
      const newTemplate = (categoryId: string) => ({
        expenseCategoryId: categoryId,
        name: 'Alquiler',
        amount: Money.fromCentavos(1000),
        dayOfMonthDue: 5,
        active: true,
        startsPeriod: period,
        endsPeriod: null,
        createdBy: OWNER_ID,
      });
      await expectTenantIsolation({
        tenantA: tenantId,
        tenantB: otherTenantId,
        seed: async (tenant) => {
          const category = tenant === tenantId ? ids.rent : otherIds.rent;
          await testDb.asAdmin({ tenantId: tenant, events: [] }, (tx) =>
            recurring.insert(tx, tenant, newTemplate(category)),
          );
        },
        list: (scope) =>
          testDb.withTransaction(scope, (tx) => recurring.list(tx, scope?.tenantId ?? tenantId)),
        insertFor: async (scope, tenant) => {
          const category = tenant === tenantId ? ids.rent : otherIds.rent;
          await testDb.withTransaction(scope, async (tx) => {
            await recurring.insert(tx, tenant, newTemplate(category));
          });
        },
      });
    });

    it('hides the payments of one tenant from another', async () => {
      // AC-5
      const expense = await aSingleExpense(bs(300));
      await payExpense(deps(), owner(), expense.id, {
        amountCentavos: bs(100),
        paymentMethodId: ids.cash,
      });
      const countFor = (tenant: string | null) =>
        testDb.withTransaction(tenant ? { tenantId: tenant, events: [] } : null, async (tx) => {
          // as: the driver result type depends on the dialect; PGlite answers { rows }.
          const result = (await tx.execute(
            sql`select count(*)::int as n from expense_payments`,
          )) as unknown as { rows: { n: number }[] };
          return result.rows[0]?.n ?? -1;
        });

      expect(await countFor(tenantId)).toBe(1);
      expect(await countFor(otherTenantId)).toBe(0);
      expect(await countFor(null)).toBe(0);
    });

    it('generates only for the tenant it runs for', async () => {
      must(await createRecurringExpense(deps(), owner(), rent()));
      must(
        await createRecurringExpense(
          deps(),
          owner(otherTenantId),
          rent({ expenseCategoryId: otherIds.rent, name: 'Ajeno' }),
        ),
      );

      const created = await testDb.withTransaction(owner(), (tx) =>
        ensurePeriodGenerated({ expenses, recurring }, tx, tenantId, Period.of(2026, 11)),
      );

      expect(created).toBe(1);
      const names = await testDb.client.query<{ name: string }>(
        'select name from expenses order by name',
      );
      expect(names.rows).toEqual([{ name: 'Alquiler' }]);
    });
  });
});
