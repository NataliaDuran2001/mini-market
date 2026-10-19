import { Money, Period } from '@mini-market/shared-kernel';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  NewRecurringExpense,
  RecurringExpensePatch,
  RecurringExpenseRepository,
} from '../application/ports/recurring-expense.repository';
import type { RecurringExpense } from '../domain/recurring-expense';
import { recurringExpenses } from './schema';

type TemplateRow = typeof recurringExpenses.$inferSelect;

const inTenant = (tenantId: string, id: string) =>
  and(eq(recurringExpenses.tenantId, tenantId), eq(recurringExpenses.id, id));

/** The CHECK constraint `recurring_expenses_period_check` guarantees both texts parse. */
function parsePeriod(text: string): Period {
  const parsed = Period.parse(text);
  if (!parsed.ok) throw new Error(`Stored period "${text}" is not YYYY-MM`);
  return parsed.value;
}

function toTemplate(row: TemplateRow): RecurringExpense {
  return {
    id: row.id,
    tenantId: row.tenantId,
    expenseCategoryId: row.expenseCategoryId,
    name: row.name,
    amount: Money.fromCentavos(row.amountCentavos),
    dayOfMonthDue: row.dayOfMonthDue,
    active: row.active,
    startsPeriod: parsePeriod(row.startsPeriod),
    endsPeriod: row.endsPeriod === null ? null : parsePeriod(row.endsPeriod),
    createdBy: row.createdBy,
  };
}

export class DrizzleRecurringExpenseRepository implements RecurringExpenseRepository {
  async insert(
    tx: Transaction,
    tenantId: string,
    template: NewRecurringExpense,
  ): Promise<RecurringExpense> {
    const [row] = await tx
      .insert(recurringExpenses)
      .values({
        tenantId,
        expenseCategoryId: template.expenseCategoryId,
        name: template.name,
        amountCentavos: template.amount.toCentavos(),
        dayOfMonthDue: template.dayOfMonthDue,
        active: template.active,
        startsPeriod: template.startsPeriod.toString(),
        endsPeriod: template.endsPeriod?.toString() ?? null,
        createdBy: template.createdBy,
      })
      .returning();
    if (!row) throw new Error('Insert of a recurring expense returned no row');
    return toTemplate(row);
  }

  async findById(tx: Transaction, tenantId: string, id: string): Promise<RecurringExpense | null> {
    const [row] = await tx.select().from(recurringExpenses).where(inTenant(tenantId, id)).limit(1);
    return row ? toTemplate(row) : null;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: RecurringExpensePatch,
  ): Promise<RecurringExpense | null> {
    const [row] = await tx
      .update(recurringExpenses)
      .set({
        ...(patch.expenseCategoryId !== undefined
          ? { expenseCategoryId: patch.expenseCategoryId }
          : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.amount !== undefined ? { amountCentavos: patch.amount.toCentavos() } : {}),
        ...(patch.dayOfMonthDue !== undefined ? { dayOfMonthDue: patch.dayOfMonthDue } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(patch.startsPeriod !== undefined
          ? { startsPeriod: patch.startsPeriod.toString() }
          : {}),
        ...(patch.endsPeriod !== undefined
          ? { endsPeriod: patch.endsPeriod?.toString() ?? null }
          : {}),
        updatedAt: sql`now()`,
      })
      .where(inTenant(tenantId, id))
      .returning();
    return row ? toTemplate(row) : null;
  }

  async list(tx: Transaction, tenantId: string): Promise<readonly RecurringExpense[]> {
    const rows = await tx
      .select()
      .from(recurringExpenses)
      .where(eq(recurringExpenses.tenantId, tenantId))
      .orderBy(asc(sql`lower(${recurringExpenses.name})`), asc(recurringExpenses.id));
    return rows.map(toTemplate);
  }

  async listActive(tx: Transaction, tenantId: string): Promise<readonly RecurringExpense[]> {
    const rows = await tx
      .select()
      .from(recurringExpenses)
      .where(and(eq(recurringExpenses.tenantId, tenantId), eq(recurringExpenses.active, true)))
      .orderBy(asc(recurringExpenses.id));
    return rows.map(toTemplate);
  }
}
