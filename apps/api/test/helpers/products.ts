import { products, units } from '../../src/modules/catalog';
import type { TestDb } from '../harness';

let sequence = 0;

/**
 * Inserts a product (and the unit it needs) straight into the tables as the owner role, for
 * suites of modules that sit above the catalog. Returns the product id.
 */
export async function seedProduct(
  testDb: TestDb,
  tenantId: string,
  options: { readonly name?: string; readonly minStock?: string; readonly avgCost?: bigint } = {},
): Promise<string> {
  sequence += 1;
  const [unit] = await testDb.db
    .insert(units)
    .values({ tenantId, code: `u${sequence}`, name: `Unidad ${sequence}` })
    .returning({ id: units.id });
  if (!unit) throw new Error('could not seed a unit');
  const [product] = await testDb.db
    .insert(products)
    .values({
      tenantId,
      name: options.name ?? `Producto ${sequence}`,
      baseUnitId: unit.id,
      salePriceCentavos: 1000n,
      avgCostCentavos: options.avgCost ?? 0n,
      minStock: options.minStock ?? '0',
    })
    .returning({ id: products.id });
  if (!product) throw new Error('could not seed a product');
  return product.id;
}
