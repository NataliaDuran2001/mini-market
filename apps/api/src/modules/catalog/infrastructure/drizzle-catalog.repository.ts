import { err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Transaction } from '../../../infrastructure/db/database';
import type { CatalogFilter, CatalogRepository } from '../application/ports/catalog.repository';
import type {
  Category,
  CatalogItemMap,
  CatalogKind,
  CatalogPatchMap,
  ExpenseCategory,
  NewCatalogItemMap,
  PaymentMethod,
  PaymentMethodKind,
  Unit,
} from '../domain/catalog-item';
import { DuplicateCatalogItemError } from '../domain/errors';
import type { PresetCatalogs } from '../domain/presets';
import { categories, expenseCategories, paymentMethods, units } from './schema';
import { isUniqueViolation } from './unique-violation';

/** Storage of one kind. `update` answers undefined when no row of the tenant has that id. */
interface KindStore<K extends CatalogKind> {
  list(tx: Transaction, tenantId: string, filter: CatalogFilter): Promise<CatalogItemMap[K][]>;
  insert(
    tx: Transaction,
    tenantId: string,
    values: NewCatalogItemMap[K],
    now: Date,
  ): Promise<CatalogItemMap[K]>;
  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: CatalogPatchMap[K],
    now: Date,
  ): Promise<CatalogItemMap[K] | undefined>;
}

const categoryStore: KindStore<'categories'> = {
  async list(tx, tenantId, filter) {
    const rows = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), activeClause(categories.isActive, filter)))
      .orderBy(asc(categories.sortOrder), asc(sql`lower(${categories.name})`));
    return rows.map(toCategory);
  },
  async insert(tx, tenantId, values, now) {
    const [row] = await tx
      .insert(categories)
      .values({ ...values, tenantId, createdAt: now, updatedAt: now })
      .returning();
    return toCategory(requireRow(row));
  },
  async update(tx, tenantId, id, patch, now) {
    const [row] = await tx
      .update(categories)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)))
      .returning();
    return row && toCategory(row);
  },
};

const unitStore: KindStore<'units'> = {
  async list(tx, tenantId, filter) {
    const rows = await tx
      .select()
      .from(units)
      .where(and(eq(units.tenantId, tenantId), activeClause(units.isActive, filter)))
      .orderBy(asc(units.sortOrder), asc(sql`lower(${units.name})`));
    return rows.map(toUnit);
  },
  async insert(tx, tenantId, values, now) {
    const [row] = await tx
      .insert(units)
      .values({ ...values, tenantId, createdAt: now, updatedAt: now })
      .returning();
    return toUnit(requireRow(row));
  },
  async update(tx, tenantId, id, patch, now) {
    const [row] = await tx
      .update(units)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(units.tenantId, tenantId), eq(units.id, id)))
      .returning();
    return row && toUnit(row);
  },
};

const paymentMethodStore: KindStore<'payment-methods'> = {
  async list(tx, tenantId, filter) {
    const rows = await tx
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.tenantId, tenantId),
          activeClause(paymentMethods.isActive, filter),
          filter.excludePaymentKinds.length > 0
            ? notInArray(paymentMethods.kind, [...filter.excludePaymentKinds])
            : undefined,
        ),
      )
      .orderBy(asc(paymentMethods.sortOrder), asc(sql`lower(${paymentMethods.name})`));
    return rows.map(toPaymentMethod);
  },
  async insert(tx, tenantId, values, now) {
    const [row] = await tx
      .insert(paymentMethods)
      .values({ ...values, tenantId, createdAt: now, updatedAt: now })
      .returning();
    return toPaymentMethod(requireRow(row));
  },
  async update(tx, tenantId, id, patch, now) {
    const [row] = await tx
      .update(paymentMethods)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(paymentMethods.tenantId, tenantId), eq(paymentMethods.id, id)))
      .returning();
    return row && toPaymentMethod(row);
  },
};

const expenseCategoryStore: KindStore<'expense-categories'> = {
  async list(tx, tenantId, filter) {
    const rows = await tx
      .select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.tenantId, tenantId),
          activeClause(expenseCategories.isActive, filter),
        ),
      )
      .orderBy(asc(expenseCategories.sortOrder), asc(sql`lower(${expenseCategories.name})`));
    return rows.map(toExpenseCategory);
  },
  async insert(tx, tenantId, values, now) {
    const [row] = await tx
      .insert(expenseCategories)
      .values({ ...values, tenantId, createdAt: now, updatedAt: now })
      .returning();
    return toExpenseCategory(requireRow(row));
  },
  async update(tx, tenantId, id, patch, now) {
    const [row] = await tx
      .update(expenseCategories)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(expenseCategories.tenantId, tenantId), eq(expenseCategories.id, id)))
      .returning();
    return row && toExpenseCategory(row);
  },
};

const STORES: { readonly [K in CatalogKind]: KindStore<K> } = {
  categories: categoryStore,
  units: unitStore,
  'payment-methods': paymentMethodStore,
  'expense-categories': expenseCategoryStore,
};

function activeClause(column: AnyPgColumn, filter: CatalogFilter): SQL | undefined {
  return filter.activeOnly ? eq(column, true) : undefined;
}

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new Error('insert into a catalog table returned no row');
  return row;
}

const toCategory = (row: typeof categories.$inferSelect): Category => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const toUnit = (row: typeof units.$inferSelect): Unit => ({
  id: row.id,
  code: row.code,
  name: row.name,
  allowsDecimals: row.allowsDecimals,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const toPaymentMethod = (row: typeof paymentMethods.$inferSelect): PaymentMethod => ({
  id: row.id,
  code: row.code,
  name: row.name,
  // The table has a check constraint on the five values.
  kind: row.kind as PaymentMethodKind,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const toExpenseCategory = (row: typeof expenseCategories.$inferSelect): ExpenseCategory => ({
  id: row.id,
  name: row.name,
  isFixed: row.isFixed,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
});

const duplicate = (kind: CatalogKind): DuplicateCatalogItemError =>
  new DuplicateCatalogItemError('Another item of this catalog already uses that name or code', {
    kind,
  });

/** Stateless: every method runs on the transaction the caller opened with `withTransaction`. */
export class DrizzleCatalogRepository implements CatalogRepository {
  list<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    filter: CatalogFilter,
  ): Promise<readonly CatalogItemMap[K][]> {
    return STORES[kind].list(tx, tenantId, filter);
  }

  async create<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    values: NewCatalogItemMap[K],
    now: Date,
  ): Promise<Result<CatalogItemMap[K], DuplicateCatalogItemError>> {
    try {
      // A savepoint keeps the caller's transaction usable after a unique violation.
      return ok(await tx.transaction((inner) => STORES[kind].insert(inner, tenantId, values, now)));
    } catch (error) {
      if (isUniqueViolation(error)) return err(duplicate(kind));
      throw error;
    }
  }

  async update<K extends CatalogKind>(
    tx: Transaction,
    tenantId: string,
    kind: K,
    id: string,
    patch: CatalogPatchMap[K],
    now: Date,
  ): Promise<Result<CatalogItemMap[K], NotFoundError | DuplicateCatalogItemError>> {
    try {
      const row = await tx.transaction((inner) =>
        STORES[kind].update(inner, tenantId, id, patch, now),
      );
      return row ? ok(row) : err(new NotFoundError('Catalog item not found', { kind, id }));
    } catch (error) {
      if (isUniqueViolation(error)) return err(duplicate(kind));
      throw error;
    }
  }

  async seed(
    tx: Transaction,
    tenantId: string,
    catalogs: PresetCatalogs,
    now: Date,
  ): Promise<void> {
    const common = { tenantId, createdAt: now, updatedAt: now };
    const rows = <T extends object>(items: readonly T[]) =>
      items.map((item) => ({ ...item, ...common }));
    if (catalogs.categories.length > 0) {
      await tx.insert(categories).values(rows(catalogs.categories)).onConflictDoNothing();
    }
    if (catalogs.units.length > 0) {
      await tx.insert(units).values(rows(catalogs.units)).onConflictDoNothing();
    }
    if (catalogs['payment-methods'].length > 0) {
      await tx
        .insert(paymentMethods)
        .values(rows(catalogs['payment-methods']))
        .onConflictDoNothing();
    }
    if (catalogs['expense-categories'].length > 0) {
      await tx
        .insert(expenseCategories)
        .values(rows(catalogs['expense-categories']))
        .onConflictDoNothing();
    }
  }
}
