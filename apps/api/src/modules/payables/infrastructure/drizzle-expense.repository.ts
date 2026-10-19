import { Money, Period } from '@mini-market/shared-kernel';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  ExpensePatch,
  ExpenseRepository,
  NewExpense,
} from '../application/ports/expense.repository';
import type { Expense, ExpensePayment, ExpenseStatus } from '../domain/expense';
import { expensePayments, expenses } from './schema';

const inTenant = (tenantId: string, id: string) =>
  and(eq(expenses.tenantId, tenantId), eq(expenses.id, id));

type ExpenseRow = typeof expenses.$inferSelect;

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    tenantId: row.tenantId,
    expenseCategoryId: row.expenseCategoryId,
    recurringExpenseId: row.recurringExpenseId,
    name: row.name,
    amount: Money.fromCentavos(row.amountCentavos),
    period: Period.of(row.periodYear, row.periodMonth),
    dueDate: row.dueDate,
    // as: the CHECK constraint `expenses_status_check` only allows these three values.
    status: row.status as ExpenseStatus,
    paid: Money.fromCentavos(row.paidCentavos),
    notes: row.notes,
  };
}

function toValues(tenantId: string, expense: NewExpense) {
  return {
    tenantId,
    expenseCategoryId: expense.expenseCategoryId,
    recurringExpenseId: expense.recurringExpenseId,
    name: expense.name,
    amountCentavos: expense.amount.toCentavos(),
    periodYear: expense.period.year,
    periodMonth: expense.period.month,
    dueDate: expense.dueDate,
    notes: expense.notes,
    createdBy: expense.createdBy,
  };
}

export class DrizzleExpenseRepository implements ExpenseRepository {
  async insert(tx: Transaction, tenantId: string, expense: NewExpense): Promise<Expense> {
    const [row] = await tx.insert(expenses).values(toValues(tenantId, expense)).returning();
    if (!row) throw new Error('Insert of an expense returned no row');
    return toExpense(row);
  }

  async insertGenerated(
    tx: Transaction,
    tenantId: string,
    generated: readonly NewExpense[],
  ): Promise<number> {
    if (generated.length === 0) return 0;
    const rows = await tx
      .insert(expenses)
      .values(generated.map((expense) => toValues(tenantId, expense)))
      // The partial unique index (tenant, template, year, month) makes this idempotent.
      .onConflictDoNothing()
      .returning({ id: expenses.id });
    return rows.length;
  }

  async findForUpdate(tx: Transaction, tenantId: string, id: string): Promise<Expense | null> {
    const [row] = await tx
      .select()
      .from(expenses)
      .where(inTenant(tenantId, id))
      .limit(1)
      .for('update');
    return row ? toExpense(row) : null;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ExpensePatch,
  ): Promise<Expense | null> {
    const [row] = await tx
      .update(expenses)
      .set({
        ...(patch.expenseCategoryId !== undefined
          ? { expenseCategoryId: patch.expenseCategoryId }
          : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.amount !== undefined ? { amountCentavos: patch.amount.toCentavos() } : {}),
        ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.paid !== undefined ? { paidCentavos: patch.paid.toCentavos() } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: sql`now()`,
      })
      .where(inTenant(tenantId, id))
      .returning();
    return row ? toExpense(row) : null;
  }

  async listByPeriod(
    tx: Transaction,
    tenantId: string,
    period: Period,
  ): Promise<readonly Expense[]> {
    const rows = await tx
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          eq(expenses.periodYear, period.year),
          eq(expenses.periodMonth, period.month),
        ),
      )
      .orderBy(
        sql`${expenses.dueDate} asc nulls last`,
        asc(sql`lower(${expenses.name})`),
        asc(expenses.id),
      );
    return rows.map(toExpense);
  }

  async insertPayment(tx: Transaction, tenantId: string, payment: ExpensePayment): Promise<void> {
    await tx.insert(expensePayments).values({
      tenantId,
      expenseId: payment.expenseId,
      amountCentavos: payment.amount.toCentavos(),
      paidAt: payment.paidAt,
      paymentMethodId: payment.paymentMethodId,
      createdBy: payment.createdBy,
    });
  }

  async listPayments(
    tx: Transaction,
    tenantId: string,
    expenseId: string,
  ): Promise<readonly ExpensePayment[]> {
    const rows = await tx
      .select()
      .from(expensePayments)
      .where(and(eq(expensePayments.tenantId, tenantId), eq(expensePayments.expenseId, expenseId)))
      .orderBy(asc(expensePayments.createdAt), asc(expensePayments.id));
    return rows.map((row) => ({
      expenseId: row.expenseId,
      amount: Money.fromCentavos(row.amountCentavos),
      paidAt: row.paidAt,
      paymentMethodId: row.paymentMethodId,
      createdBy: row.createdBy,
    }));
  }
}
