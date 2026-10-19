import { and, asc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type { SupplierFilter, SupplierRepository } from '../application/ports/supplier.repository';
import type { Supplier, SupplierDetails, SupplierDetailsPatch } from '../domain/supplier';
import { suppliers } from './schema';

const columns = {
  id: suppliers.id,
  tenantId: suppliers.tenantId,
  name: suppliers.name,
  phone: suppliers.phone,
  email: suppliers.email,
  taxId: suppliers.taxId,
  notes: suppliers.notes,
  active: suppliers.active,
};

const inTenant = (tenantId: string, id: string) =>
  and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, id));

/** `%` and `_` typed by the user match themselves, not "anything". */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function matches(q: string): SQL | undefined {
  const pattern = `%${escapeLike(q)}%`;
  return or(
    ilike(suppliers.name, pattern),
    ilike(suppliers.phone, pattern),
    ilike(suppliers.email, pattern),
    ilike(suppliers.taxId, pattern),
  );
}

export class DrizzleSupplierRepository implements SupplierRepository {
  async lockNames(tx: Transaction, tenantId: string): Promise<void> {
    // One advisory lock per tenant, taken before the name check, so two writers cannot both pass it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`suppliers:${tenantId}`}))`);
  }

  async list(
    tx: Transaction,
    tenantId: string,
    filter: SupplierFilter,
  ): Promise<readonly Supplier[]> {
    const conditions = [
      eq(suppliers.tenantId, tenantId),
      filter.active === undefined ? undefined : eq(suppliers.active, filter.active),
      filter.q ? matches(filter.q) : undefined,
    ];
    return tx
      .select(columns)
      .from(suppliers)
      .where(and(...conditions))
      .orderBy(asc(sql`lower(${suppliers.name})`), asc(suppliers.id));
  }

  async findById(tx: Transaction, tenantId: string, id: string): Promise<Supplier | null> {
    const [row] = await tx.select(columns).from(suppliers).where(inTenant(tenantId, id)).limit(1);
    return row ?? null;
  }

  async nameTaken(
    tx: Transaction,
    tenantId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, tenantId),
          sql`lower(${suppliers.name}) = lower(${name})`,
          exceptId === undefined ? undefined : ne(suppliers.id, exceptId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    details: SupplierDetails,
    createdBy: string,
  ): Promise<Supplier> {
    const [row] = await tx
      .insert(suppliers)
      .values({ ...details, tenantId, createdBy })
      .returning(columns);
    if (!row) throw new Error('Insert of a supplier returned no row');
    return row;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: SupplierDetailsPatch & { readonly active?: boolean },
  ): Promise<Supplier | null> {
    const [row] = await tx
      .update(suppliers)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(inTenant(tenantId, id))
      .returning(columns);
    return row ?? null;
  }
}
