import { FixedClock, Money, unwrapOrThrow } from '@mini-market/shared-kernel';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { createCustomer } from '../../src/modules/receivables/application/create-customer';
import { getCustomerStatement } from '../../src/modules/receivables/application/get-customer-statement';
import { listBalances } from '../../src/modules/receivables/application/list-balances';
import { registerCharge } from '../../src/modules/receivables/application/register-charge';
import { registerCollection } from '../../src/modules/receivables/application/register-collection';
import { reverseCharge } from '../../src/modules/receivables/application/reverse-charge';
import { searchCustomers } from '../../src/modules/receivables/application/search-customers';
import { updateCustomer } from '../../src/modules/receivables/application/update-customer';
import { DrizzleCreditLedgerRepository } from '../../src/modules/receivables/infrastructure/drizzle-credit-ledger.repository';
import { DrizzleCustomerRepository } from '../../src/modules/receivables/infrastructure/drizzle-customer.repository';
import { RECEIVABLES_PERMISSIONS } from '../../src/modules/receivables/receivables.permissions';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedTenant } from '../helpers/seed';
import { expectDbError, expectTenantIsolation } from '../isolation';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const permissions = RECEIVABLES_PERMISSIONS;

const bs = (amount: number): number => amount * 100;
const saleRef = (n: number) => ({
  type: 'sale',
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
});

describe('receivables use cases (S6)', () => {
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  const customers = new DrizzleCustomerRepository();
  const ledger = new DrizzleCreditLedgerRepository();
  const audit = new DrizzleAuditRepository();
  const clock = new FixedClock('2026-10-15T14:00:00Z');
  const deps = () => ({
    customers,
    ledger,
    audit,
    clock,
    withTransaction: testDb.withTransaction,
  });
  const owner = (id = tenantId, settings = {}) =>
    asOwner(id, { userId: OWNER_ID, permissions, settings });
  const employee = (settings = {}) =>
    asEmployee(tenantId, { userId: EMPLOYEE_ID, permissions, settings });
  const creditOff = { modules: { credit_sales: false } };

  const newCustomer = async (name = 'Doña Rosa', limitBs?: number, ctx = owner()) =>
    unwrapOrThrow(
      await createCustomer(deps(), ctx, {
        name,
        ...(limitBs === undefined ? {} : { creditLimitCentavos: bs(limitBs) }),
      }),
    );
  const charge = (customerId: string, amountBs: number, sale: number, ctx = owner()) =>
    testDb.withTransaction(ctx, (tx) =>
      registerCharge(deps(), ctx, tx, customerId, Money.fromCentavos(bs(amountBs)), saleRef(sale)),
    );
  const collect = (
    customerId: string,
    amountBs: number,
    extra: { occurredOn?: string } = {},
    ctx = owner(),
  ) =>
    registerCollection(deps(), ctx, customerId, {
      amountCentavos: bs(amountBs),
      method: 'cash',
      ...extra,
    });
  const reverse = (sale: number, ctx = owner()) =>
    testDb.withTransaction(ctx, (tx) => reverseCharge(deps(), ctx, tx, saleRef(sale)));
  const statement = async (customerId: string, ctx = owner()) =>
    unwrapOrThrow(await getCustomerStatement(deps(), ctx, customerId));
  const codeOf = (result: { ok: boolean; error?: { code: string } }) =>
    result.ok ? 'OK' : result.error?.code;
  const auditActions = async () =>
    (
      await testDb.client.query<{ action: string }>('select action from audit_log order by at')
    ).rows.map((row) => row.action);

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  afterAll(async () => {
    await testDb.close();
  });
  beforeEach(async () => {
    await testDb.truncateAll();
    clock.set('2026-10-15T14:00:00Z');
    tenantId = await seedTenant(testDb, { slug: 'sol' });
    otherTenantId = await seedTenant(testDb, { slug: 'luna' });
  });

  describe('statement and balance', () => {
    it('shows balance 60 and three lines in order after charges 50 and 30 and a collection of 20', async () => {
      // AC-1
      const rosa = await newCustomer();
      expect((await charge(rosa.id, 50, 1)).ok).toBe(true);
      expect((await charge(rosa.id, 30, 2)).ok).toBe(true);
      expect((await collect(rosa.id, 20)).ok).toBe(true);

      const result = await statement(rosa.id);

      expect(result.balance.toCentavos()).toBe(6_000n);
      expect(result.lines.map((line) => [line.entry.kind, line.entry.amount.toCentavos()])).toEqual(
        [
          ['charge', 5_000n],
          ['charge', 3_000n],
          ['payment', -2_000n],
        ],
      );
      expect(result.lines.map((line) => line.balanceAfter.toCentavos())).toEqual([
        5_000n,
        8_000n,
        6_000n,
      ]);
    });

    it('starts at zero for a customer without lines', async () => {
      // AC-1
      const rosa = await newCustomer();

      const result = await statement(rosa.id);

      expect(result.balance.toCentavos()).toBe(0n);
      expect(result.lines).toEqual([]);
    });

    it('places a back-dated collection by its date, not by the moment it was written', async () => {
      // AC-1
      const rosa = await newCustomer();
      clock.set('2026-10-10T14:00:00Z');
      await charge(rosa.id, 50, 1);
      clock.set('2026-10-15T14:00:00Z');
      await charge(rosa.id, 30, 2);
      await collect(rosa.id, 20, { occurredOn: '2026-10-12' });

      const result = await statement(rosa.id);

      expect(result.lines.map((line) => line.entry.kind)).toEqual(['charge', 'payment', 'charge']);
      expect(result.balance.toCentavos()).toBe(6_000n);
    });

    it('keeps the credit limit visible to an employee on the statement and answers 404 for another tenant', async () => {
      const rosa = await newCustomer('Rosa', 100);

      const seen = await statement(rosa.id, employee());
      const foreign = await getCustomerStatement(deps(), owner(otherTenantId), rosa.id);

      expect(seen.customer.creditLimitCentavos).toBe(10_000n);
      expect(codeOf(foreign)).toBe('CUSTOMER_NOT_FOUND');
    });
  });

  describe('credit limit', () => {
    it('refuses a charge of 20 when the limit is 100 and the balance 90, and accepts one that reaches the limit', async () => {
      // AC-2
      const rosa = await newCustomer('Rosa', 100);
      await charge(rosa.id, 90, 1);

      const refused = await charge(rosa.id, 20, 2);
      const accepted = await charge(rosa.id, 10, 3);

      expect(codeOf(refused)).toBe('CREDIT_LIMIT_EXCEEDED');
      expect(!refused.ok && refused.error.details).toEqual({
        balanceCentavos: 9_000,
        chargeCentavos: 2_000,
        creditLimitCentavos: 10_000,
      });
      expect(accepted.ok).toBe(true);
      expect((await statement(rosa.id)).balance.toCentavos()).toBe(10_000n);
    });

    it('lets a customer without limit run any balance, and a limit of zero allows no credit', async () => {
      // AC-2
      const free = await newCustomer('Libre');
      const none = await newCustomer('Sin credito', 0);

      expect((await charge(free.id, 1_000_000, 1)).ok).toBe(true);
      expect(codeOf(await charge(none.id, 1, 2))).toBe('CREDIT_LIMIT_EXCEEDED');
    });

    it('lets the owner set, change and clear the limit, and audits each change', async () => {
      const rosa = await newCustomer('Rosa');

      await updateCustomer(deps(), owner(), rosa.id, { creditLimitCentavos: bs(50) });
      await updateCustomer(deps(), owner(), rosa.id, { name: 'Rosa M.' });
      const cleared = await updateCustomer(deps(), owner(), rosa.id, {
        creditLimitCentavos: null,
      });

      expect(cleared.ok && cleared.value.creditLimitCentavos).toBeNull();
      expect(await auditActions()).toEqual([
        'customer.credit_limit_changed',
        'customer.credit_limit_changed',
      ]);
    });

    it('does not let an employee set or change the limit, nor deactivate a customer', async () => {
      const rosa = await newCustomer('Rosa', 100);

      const creating = await createCustomer(deps(), employee(), {
        name: 'Nuevo',
        creditLimitCentavos: bs(500),
      });
      const raising = await updateCustomer(deps(), employee(), rosa.id, {
        creditLimitCentavos: bs(5_000),
      });
      const deactivating = await updateCustomer(deps(), employee(), rosa.id, { active: false });

      expect([creating, raising, deactivating].map(codeOf)).toEqual([
        'FORBIDDEN',
        'FORBIDDEN',
        'FORBIDDEN',
      ]);
      expect(!raising.ok && raising.error.details).toEqual({ permission: 'receivables.manage' });
      expect((await statement(rosa.id)).customer.creditLimitCentavos).toBe(10_000n);
    });
  });

  describe('customers', () => {
    it('lets an employee create a customer without limit and edit contact data', async () => {
      const created = await createCustomer(deps(), employee(), {
        name: 'Don Pedro',
        phone: '70011223',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value).toMatchObject({
        name: 'Don Pedro',
        phone: '70011223',
        documentId: null,
        creditLimitCentavos: null,
        active: true,
      });

      const edited = await updateCustomer(deps(), employee(), created.value.id, {
        phone: '70099999',
        notes: 'vive en la esquina',
      });
      expect(edited.ok && edited.value).toMatchObject({
        phone: '70099999',
        notes: 'vive en la esquina',
      });
    });

    it('searches by name, phone and document, ignoring case, and filters by active', async () => {
      const rosa = await newCustomer('Rosa Quispe');
      await updateCustomer(deps(), owner(), rosa.id, { phone: '71234567', documentId: 'CI-998' });
      const pedro = await newCustomer('Pedro');
      await updateCustomer(deps(), owner(), pedro.id, { active: false });
      const names = async (filter: { q?: string; active?: boolean }) =>
        unwrapOrThrow(await searchCustomers(deps(), employee(), filter)).map((c) => c.name);

      expect(await names({})).toEqual(['Pedro', 'Rosa Quispe']);
      expect(await names({ q: 'QUISPE' })).toEqual(['Rosa Quispe']);
      expect(await names({ q: '7123' })).toEqual(['Rosa Quispe']);
      expect(await names({ q: 'ci-99' })).toEqual(['Rosa Quispe']);
      expect(await names({ active: false })).toEqual(['Pedro']);
      expect(await names({ q: '%' })).toEqual([]);
    });

    it('answers CUSTOMER_NOT_FOUND for an unknown customer and for one of another tenant', async () => {
      const foreign = await newCustomer('Ajena', undefined, owner(otherTenantId));

      const results = [
        await updateCustomer(deps(), owner(), foreign.id, { name: 'Robo' }),
        await collect(foreign.id, 1),
        await charge(foreign.id, 1, 1),
      ];

      expect(results.map(codeOf)).toEqual([
        'CUSTOMER_NOT_FOUND',
        'CUSTOMER_NOT_FOUND',
        'CUSTOMER_NOT_FOUND',
      ]);
    });

    it('refuses to charge an inactive customer but still accepts their collection', async () => {
      const rosa = await newCustomer('Rosa');
      await charge(rosa.id, 40, 1);
      await updateCustomer(deps(), owner(), rosa.id, { active: false });

      expect(codeOf(await charge(rosa.id, 10, 2))).toBe('CUSTOMER_INACTIVE');
      expect((await collect(rosa.id, 40)).ok).toBe(true);
    });
  });

  describe('charges and reversals', () => {
    it('charges a sale once', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 10, 1);

      expect(codeOf(await charge(rosa.id, 10, 1))).toBe('CHARGE_ALREADY_REGISTERED');
      expect((await statement(rosa.id)).lines).toHaveLength(1);
    });

    it('rejects a charge of zero or less', async () => {
      const rosa = await newCustomer();

      const result = await testDb.withTransaction(owner(), (tx) =>
        registerCharge(deps(), owner(), tx, rosa.id, Money.zero(), saleRef(1)),
      );

      expect(codeOf(result)).toBe('VALIDATION_ERROR');
    });

    it('restores the balance with a reversal line and keeps the charge in the ledger (S12)', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 50, 1);
      await charge(rosa.id, 30, 2);

      const reversed = await reverse(2);

      expect(reversed.ok).toBe(true);
      const result = await statement(rosa.id);
      expect(result.balance.toCentavos()).toBe(5_000n);
      expect(result.lines.map((line) => line.entry.kind)).toEqual(['charge', 'charge', 'reversal']);
      expect(result.lines[2]?.entry.amount.toCentavos()).toBe(-3_000n);
      expect(result.lines[2]?.entry.reference).toEqual(saleRef(2));
    });

    it('reverses a sale once and refuses one that was never charged', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 50, 1);
      await reverse(1);

      expect(codeOf(await reverse(1))).toBe('CHARGE_ALREADY_REVERSED');
      expect(codeOf(await reverse(99))).toBe('CHARGE_NOT_FOUND');
      expect((await statement(rosa.id)).balance.toCentavos()).toBe(0n);
    });

    it('cannot reverse the charge of a sale of another tenant', async () => {
      const theirs = await newCustomer('Ajena', undefined, owner(otherTenantId));
      await charge(theirs.id, 50, 1, owner(otherTenantId));

      expect(codeOf(await reverse(1))).toBe('CHARGE_NOT_FOUND');
      const result = await statement(theirs.id, owner(otherTenantId));
      expect(result.balance.toCentavos()).toBe(5_000n);
    });

    it('still reverses a charge after the module was switched off, but charges no more', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 50, 1);

      const off = owner(tenantId, creditOff);
      const reversed = await reverse(1, off);
      const charged = await charge(rosa.id, 5, 2, off);

      expect(reversed.ok).toBe(true);
      expect(codeOf(charged)).toBe('MODULE_DISABLED');
    });

    it('rolls the charge back with the transaction of the sale', async () => {
      const rosa = await newCustomer();

      await expect(
        testDb.withTransaction(owner(), async (tx) => {
          await registerCharge(
            deps(),
            owner(),
            tx,
            rosa.id,
            Money.fromCentavos(bs(10)),
            saleRef(1),
          );
          throw new Error('the sale failed after the charge');
        }),
      ).rejects.toThrow('the sale failed');

      expect((await statement(rosa.id)).lines).toEqual([]);
    });
  });

  describe('collections', () => {
    it('does not accept a collection above the balance or one dated in the future', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 50, 1);

      const above = await collect(rosa.id, 60);
      const future = await collect(rosa.id, 10, { occurredOn: '2026-10-16' });
      const impossible = await collect(rosa.id, 10, { occurredOn: '2026-02-30' });
      const exact = await collect(rosa.id, 50);

      expect(codeOf(above)).toBe('COLLECTION_EXCEEDS_BALANCE');
      expect(!above.ok && above.error.details).toEqual({ balanceCentavos: 5_000 });
      expect(codeOf(future)).toBe('VALIDATION_ERROR');
      expect(codeOf(impossible)).toBe('VALIDATION_ERROR');
      expect(exact.ok && exact.value.balance.toCentavos()).toBe(0n);
    });

    it('lets an employee collect, records the method and audits the collection', async () => {
      const rosa = await newCustomer();
      await charge(rosa.id, 50, 1);

      const result = await registerCollection(deps(), employee(), rosa.id, {
        amountCentavos: bs(20),
        method: 'qr',
      });

      expect(result.ok && result.value.entry).toMatchObject({
        kind: 'payment',
        paymentMethod: 'qr',
        createdBy: EMPLOYEE_ID,
      });
      expect(await auditActions()).toEqual(['collection.recorded']);
    });
  });

  describe('balances list', () => {
    it('sorts by debt, ages the oldest unpaid charge in tenant days and totals what is owed', async () => {
      const rosa = await newCustomer('Rosa');
      const pedro = await newCustomer('Pedro');
      const luis = await newCustomer('Luis');
      clock.set('2026-10-01T14:00:00Z');
      await charge(rosa.id, 40, 1);
      await charge(pedro.id, 100, 2);
      clock.set('2026-10-10T14:00:00Z');
      await charge(rosa.id, 70, 3);
      await collect(pedro.id, 100);
      clock.set('2026-10-15T14:00:00Z');
      await collect(rosa.id, 40);

      const result = unwrapOrThrow(await listBalances(deps(), employee(), {}));

      expect(
        result.items.map((row) => [row.customer.name, row.balance.toCentavos(), row.overdueDays]),
      ).toEqual([
        ['Rosa', 7_000n, 5],
        ['Luis', 0n, null],
        ['Pedro', 0n, null],
      ]);
      expect(result.totalPending.toCentavos()).toBe(7_000n);
      expect(luis.id).toBeDefined();
    });

    it('filters by name and by balance, and keeps the total over the whole business', async () => {
      const rosa = await newCustomer('Rosa');
      await newCustomer('Pedro');
      await charge(rosa.id, 25, 1);

      const owing = unwrapOrThrow(await listBalances(deps(), owner(), { withBalance: true }));
      const byName = unwrapOrThrow(await listBalances(deps(), owner(), { q: 'pedro' }));

      expect(owing.items.map((row) => row.customer.name)).toEqual(['Rosa']);
      expect(byName.items.map((row) => row.customer.name)).toEqual(['Pedro']);
      expect(byName.totalPending.toCentavos()).toBe(2_500n);
    });

    it('never shows or totals the debt of another tenant', async () => {
      const mine = await newCustomer('Mia');
      const theirs = await newCustomer('Ajena', undefined, owner(otherTenantId));
      await charge(mine.id, 10, 1);
      await charge(theirs.id, 500, 2, owner(otherTenantId));

      const result = unwrapOrThrow(await listBalances(deps(), owner(), {}));

      expect(result.items.map((row) => row.customer.name)).toEqual(['Mia']);
      expect(result.totalPending.toCentavos()).toBe(1_000n);
    });

    it('does not count a reversed charge as debt', async () => {
      const rosa = await newCustomer('Rosa');
      await charge(rosa.id, 25, 1);
      await reverse(1);

      const result = unwrapOrThrow(await listBalances(deps(), owner(), {}));

      expect(result.items[0]).toMatchObject({ overdueDays: null });
      expect(result.totalPending.toCentavos()).toBe(0n);
    });
  });

  describe('module flag', () => {
    it('answers MODULE_DISABLED from every use case while credit_sales is off', async () => {
      // AC-3
      const rosa = await newCustomer();
      const off = owner(tenantId, creditOff);
      const offEmployee = employee(creditOff);

      const results = [
        await createCustomer(deps(), off, { name: 'X' }),
        await updateCustomer(deps(), off, rosa.id, { name: 'Y' }),
        await searchCustomers(deps(), off, {}),
        await getCustomerStatement(deps(), off, rosa.id),
        await listBalances(deps(), off, {}),
        await collect(rosa.id, 1, {}, off),
        await charge(rosa.id, 1, 1, off),
        await searchCustomers(deps(), offEmployee, {}),
      ];

      expect(results.map(codeOf)).toEqual(Array(results.length).fill('MODULE_DISABLED'));
      expect(!results[0]?.ok && results[0]?.error.details).toEqual({ module: 'credit_sales' });
    });
  });

  describe('isolation and immutability', () => {
    it('keeps tenant A and tenant B apart in customers', async () => {
      // AC-4
      await expectTenantIsolation<{ tenantId: string }>({
        tenantA: tenantId,
        tenantB: otherTenantId,
        seed: async (id) => {
          await newCustomer('Cliente', undefined, owner(id));
        },
        list: (scope) =>
          testDb.withTransaction(scope, (tx) =>
            // The wrong tenant id on purpose: the policy still answers with the bound tenant only.
            customers.list(tx, scope?.tenantId ?? tenantId, {}),
          ),
        insertFor: (scope, otherId) =>
          testDb.withTransaction(scope, async (tx) => {
            await customers.insert(
              tx,
              otherId,
              {
                name: 'Intruso',
                phone: null,
                documentId: null,
                creditLimitCentavos: null,
                notes: null,
              },
              OWNER_ID,
            );
          }),
      });
    });

    it('keeps tenant A and tenant B apart in the credit ledger', async () => {
      // AC-4
      const customerOf = new Map<string, string>();
      await expectTenantIsolation<{ tenantId: string }>({
        tenantA: tenantId,
        tenantB: otherTenantId,
        seed: async (id) => {
          const customer = await newCustomer('Cliente', undefined, owner(id));
          customerOf.set(id, customer.id);
          await testDb.withTransaction(owner(id), (tx) =>
            registerCharge(
              deps(),
              owner(id),
              tx,
              customer.id,
              Money.fromCentavos(bs(10)),
              saleRef(id === tenantId ? 1 : 2),
            ),
          );
        },
        list: (scope) =>
          testDb.withTransaction(scope, (tx) =>
            ledger.entriesOfCustomers(tx, scope?.tenantId ?? tenantId, [...customerOf.values()]),
          ),
        insertFor: (scope, otherId) =>
          testDb.withTransaction(scope, async (tx) => {
            await ledger.append(tx, otherId, {
              customerId: customerOf.get(otherId) ?? '',
              kind: 'charge',
              amount: Money.fromCentavos(100),
              reference: null,
              paymentMethod: null,
              occurredAt: clock.now(),
              createdBy: OWNER_ID,
            });
          }),
      });
    });

    it('does not let a ledger line point at a customer of another tenant', async () => {
      const foreign = await newCustomer('Ajena', undefined, owner(otherTenantId));

      await expectDbError(
        testDb.withTransaction(owner(), (tx) =>
          ledger.append(tx, tenantId, {
            customerId: foreign.id,
            kind: 'charge',
            amount: Money.fromCentavos(100),
            reference: saleRef(1),
            paymentMethod: null,
            occurredAt: clock.now(),
            createdBy: OWNER_ID,
          }),
        ),
        /foreign key|credit_ledger_customer_fk/,
      );
    });

    it('refuses UPDATE and DELETE on the ledger, as app_user and as the table owner', async () => {
      // Ledgers are immutable (hard rule 3)
      const rosa = await newCustomer();
      await charge(rosa.id, 10, 1);
      for (const statementSql of [
        'update credit_ledger set amount_centavos = 1',
        'delete from credit_ledger',
        'truncate credit_ledger',
      ]) {
        await expectDbError(
          testDb.withTransaction(owner(), (tx) => tx.execute(sql.raw(statementSql))),
          /permission denied/,
        );
      }
      for (const statementSql of [
        'update credit_ledger set amount_centavos = 1',
        'delete from credit_ledger',
      ]) {
        await expectDbError(
          testDb.asAdmin(null, (tx) => tx.execute(sql.raw(statementSql))),
          /append-only/,
        );
      }
      expect((await statement(rosa.id)).balance.toCentavos()).toBe(1_000n);
    });

    it('refuses to delete a customer as app_user', async () => {
      const rosa = await newCustomer();

      await expectDbError(
        testDb.withTransaction(owner(), (tx) =>
          tx.execute(sql`delete from customers where id = ${rosa.id}`),
        ),
        /permission denied/,
      );
    });

    it.each([
      ['a charge of zero', 'charge', 0, null],
      ['a negative charge', 'charge', -5, null],
      ['a positive payment', 'payment', 5, 'cash'],
      ['a payment without method', 'payment', -5, null],
      ['a payment by credit', 'payment', -5, 'credit'],
      ['a reversal with a method', 'reversal', -5, 'cash'],
      ['an unknown kind', 'gift', 5, null],
    ])('rejects %s at the database', async (_label, kind, amount, method) => {
      const rosa = await newCustomer();

      await expectDbError(
        testDb.client.query(
          'insert into credit_ledger (tenant_id, customer_id, kind, amount_centavos, payment_method, occurred_at, created_by) values ($1, $2, $3, $4, $5, now(), $6)',
          [tenantId, rosa.id, kind, amount, method, OWNER_ID],
        ),
        /check constraint|violates/,
      );
    });
  });
});
