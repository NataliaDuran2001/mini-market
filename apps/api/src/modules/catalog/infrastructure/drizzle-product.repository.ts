import {
  err,
  Money,
  NotFoundError,
  ok,
  Quantity,
  ValidationError,
} from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import { and, asc, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type { ProductPage, ProductRepository } from '../application/ports/product.repository';
import { DuplicateCodeError } from '../domain/errors';
import type { NewProduct, Product, ProductPatch, ProductSearch } from '../domain/product';
import { categories, productPresentations, products, units } from './schema';
import { isUniqueViolation } from './unique-violation';

type ProductRow = typeof products.$inferSelect;
type PresentationRow = typeof productPresentations.$inferSelect;

const duplicateCode = (code: string | null | undefined): DuplicateCodeError =>
  new DuplicateCodeError('Another product of this business already uses that code', { code });

/** `%` and `_` in the text the user typed are literal characters, not wildcards. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function toProduct(row: ProductRow, presentations: readonly PresentationRow[]): Product {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    categoryId: row.categoryId,
    baseUnitId: row.baseUnitId,
    salePrice: Money.fromCentavos(row.salePriceCentavos),
    avgCost: Money.fromCentavos(row.avgCostCentavos),
    minStock: Quantity.parse(row.minStock),
    isActive: row.isActive,
    presentations: presentations
      .filter((presentation) => presentation.productId === row.id)
      .map((presentation) => ({
        id: presentation.id,
        name: presentation.name,
        factor: presentation.factor,
        salePrice: Money.fromCentavos(presentation.salePriceCentavos),
        isDefault: presentation.isDefault,
      })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function presentationsOf(
  tx: Transaction,
  tenantId: string,
  productIds: readonly string[],
): Promise<PresentationRow[]> {
  if (productIds.length === 0) return [];
  return tx
    .select()
    .from(productPresentations)
    .where(
      and(
        eq(productPresentations.tenantId, tenantId),
        inArray(productPresentations.productId, [...productIds]),
      ),
    )
    .orderBy(asc(productPresentations.factor), asc(productPresentations.name));
}

/** A category or unit must belong to the tenant; the composite foreign keys are the backstop. */
async function checkReferences(
  tx: Transaction,
  tenantId: string,
  refs: { readonly categoryId?: string | null | undefined; readonly baseUnitId?: string },
): Promise<Result<{ unitName: string | undefined }, ValidationError>> {
  if (refs.categoryId) {
    const [found] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, refs.categoryId)));
    if (!found) {
      return err(new ValidationError('Category does not exist', { field: 'categoryId' }));
    }
  }
  if (!refs.baseUnitId) return ok({ unitName: undefined });
  const [unit] = await tx
    .select({ name: units.name })
    .from(units)
    .where(and(eq(units.tenantId, tenantId), eq(units.id, refs.baseUnitId)));
  if (!unit) return err(new ValidationError('Unit does not exist', { field: 'baseUnitId' }));
  return ok({ unitName: unit.name });
}

function searchConditions(tenantId: string, search: ProductSearch): SQL | undefined {
  const text = search.q?.trim();
  return and(
    eq(products.tenantId, tenantId),
    search.activeOnly ? eq(products.isActive, true) : undefined,
    search.categoryId ? eq(products.categoryId, search.categoryId) : undefined,
    text
      ? or(
          ilike(products.name, `%${escapeLike(text)}%`),
          sql`lower(${products.code}) = lower(${text})`,
        )
      : undefined,
  );
}

/** Code match first, then names that start with the text, then everything else by name. */
function searchOrder(search: ProductSearch): SQL[] {
  const text = search.q?.trim();
  const rank = text
    ? [
        sql`case when lower(${products.code}) = lower(${text}) then 0
                 when lower(${products.name}) like lower(${escapeLike(text) + '%'}) then 1
                 else 2 end`,
      ]
    : [];
  return [...rank, sql`lower(${products.name})`, sql`${products.code}`];
}

/** Stateless: every method runs on the transaction the caller opened with `withTransaction`. */
export class DrizzleProductRepository implements ProductRepository {
  async findById(
    tx: Transaction,
    tenantId: string,
    id: string,
    options: { readonly forUpdate?: boolean } = {},
  ): Promise<Product | null> {
    const query = tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
      .limit(1);
    const [row] = await (options.forUpdate ? query.for('update') : query);
    if (!row) return null;
    return toProduct(row, await presentationsOf(tx, tenantId, [row.id]));
  }

  async search(tx: Transaction, tenantId: string, search: ProductSearch): Promise<ProductPage> {
    const where = searchConditions(tenantId, search);
    const rows = await tx
      .select()
      .from(products)
      .where(where)
      .orderBy(...searchOrder(search))
      .limit(search.pageSize)
      .offset((search.page - 1) * search.pageSize);
    const [total] = await tx.select({ value: count() }).from(products).where(where);
    const presentations = await presentationsOf(
      tx,
      tenantId,
      rows.map((row) => row.id),
    );
    return {
      items: rows.map((row) => toProduct(row, presentations)),
      total: total?.value ?? 0,
    };
  }

  async create(
    tx: Transaction,
    tenantId: string,
    product: NewProduct,
    now: Date,
  ): Promise<Result<Product, DuplicateCodeError | ValidationError>> {
    const refs = await checkReferences(tx, tenantId, product);
    if (!refs.ok) return refs;
    try {
      // A savepoint keeps the caller's transaction usable after a unique violation.
      const created = await tx.transaction(async (inner) => {
        const [row] = await inner
          .insert(products)
          .values({
            tenantId,
            name: product.name,
            code: product.code,
            categoryId: product.categoryId,
            baseUnitId: product.baseUnitId,
            salePriceCentavos: product.salePrice.toCentavos(),
            minStock: product.minStock.toString(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new Error('insert into products returned no row');
        const [presentation] = await inner
          .insert(productPresentations)
          .values({
            tenantId,
            productId: row.id,
            name: refs.value.unitName ?? product.name,
            factor: 1,
            salePriceCentavos: product.salePrice.toCentavos(),
            isDefault: true,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!presentation) throw new Error('insert into product_presentations returned no row');
        return toProduct(row, [presentation]);
      });
      return ok(created);
    } catch (error) {
      if (isUniqueViolation(error)) return err(duplicateCode(product.code));
      throw error;
    }
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: ProductPatch,
    now: Date,
  ): Promise<Result<Product, NotFoundError | DuplicateCodeError | ValidationError>> {
    const refs = await checkReferences(tx, tenantId, { categoryId: patch.categoryId });
    if (!refs.ok) return refs;
    try {
      const updated = await tx.transaction(async (inner) => {
        const [row] = await inner
          .update(products)
          .set({
            name: patch.name,
            code: patch.code,
            categoryId: patch.categoryId,
            salePriceCentavos: patch.salePrice?.toCentavos(),
            minStock: patch.minStock?.toString(),
            isActive: patch.isActive,
            updatedAt: now,
          })
          .where(and(eq(products.tenantId, tenantId), eq(products.id, id)))
          .returning();
        if (!row) return undefined;
        if (patch.salePrice) {
          await inner
            .update(productPresentations)
            .set({ salePriceCentavos: patch.salePrice.toCentavos(), updatedAt: now })
            .where(
              and(
                eq(productPresentations.tenantId, tenantId),
                eq(productPresentations.productId, id),
                eq(productPresentations.isDefault, true),
              ),
            );
        }
        return toProduct(row, await presentationsOf(inner, tenantId, [id]));
      });
      return updated ? ok(updated) : err(new NotFoundError('Product not found', { id }));
    } catch (error) {
      if (isUniqueViolation(error)) return err(duplicateCode(patch.code));
      throw error;
    }
  }
}
