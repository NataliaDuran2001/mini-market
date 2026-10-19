import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Transaction } from '../../../infrastructure/db/database';
import type {
  CustomerFilter,
  CustomerRepository,
} from '../application/ports/customer.repository';
import type { Customer, CustomerDetails, CustomerPatch } from '../domain/customer';
import { customers } from './schema';

const columns = {
  id: customers.id,
  tenantId: customers.tenantId,
  name: customers.name,
  phone: customers.phone,
  documentId: customers.documentId,
  creditLimitCentavos: customers.creditLimitCentavos,
  notes: customers.notes,
  active: customers.active,
};

const inTenant = (tenantId: string, id: string) =>
  and(eq(customers.tenantId, tenantId), eq(customers.id, id));

/** `%` and `_` typed by the user match themselves, not "anything". */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function matches(q: string): SQL | undefined {
  const pattern = `%${escapeLike(q)}%`;
  return or(
    ilike(customers.name, pattern),
    ilike(customers.phone, pattern),
    ilike(customers.documentId, pattern),
  );
}

export class DrizzleCustomerRepository implements CustomerRepository {
  async list(
    tx: Transaction,
    tenantId: string,
    filter: CustomerFilter,
  ): Promise<readonly Customer[]> {
    const conditions = [
      eq(customers.tenantId, tenantId),
      filter.active === undefined ? undefined : eq(customers.active, filter.active),
      filter.q ? matches(filter.q) : undefined,
    ];
    return tx
      .select(columns)
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(sql`lower(${customers.name})`), asc(customers.id));
  }

  async findById(tx: Transaction, tenantId: string, id: string): Promise<Customer | null> {
    const [row] = await tx.select(columns).from(customers).where(inTenant(tenantId, id)).limit(1);
    return row ?? null;
  }

  async lockById(tx: Transaction, tenantId: string, id: string): Promise<Customer | null> {
    const [row] = await tx
      .select(columns)
      .from(customers)
      .where(inTenant(tenantId, id))
      .limit(1)
      .for('update');
    return row ?? null;
  }

  async insert(
    tx: Transaction,
    tenantId: string,
    details: CustomerDetails,
    createdBy: string,
  ): Promise<Customer> {
    const [row] = await tx
      .insert(customers)
      .values({ ...details, tenantId, createdBy })
      .returning(columns);
    if (!row) throw new Error('Insert of a customer returned no row');
    return row;
  }

  async update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: CustomerPatch,
  ): Promise<Customer | null> {
    const [row] = await tx
      .update(customers)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(inTenant(tenantId, id))
      .returning(columns);
    return row ?? null;
  }
}
