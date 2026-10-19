import type { Transaction } from '../../../../infrastructure/db/database';
import type { Customer, CustomerDetails, CustomerPatch } from '../../domain/customer';

export interface CustomerFilter {
  /** Matches name, phone and document, ignoring case. */
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
}

/**
 * Customers of a tenant. Every method takes `tenantId` and puts it in the query, so a wrong id can
 * only miss, never reach another tenant; row level security is the second wall.
 */
export interface CustomerRepository {
  /** Ordered by name. */
  list(tx: Transaction, tenantId: string, filter: CustomerFilter): Promise<readonly Customer[]>;

  findById(tx: Transaction, tenantId: string, id: string): Promise<Customer | null>;

  /**
   * Reads the customer and holds a row lock until the transaction ends, so two charges of the
   * same customer queue and each one checks the limit against the balance the other committed.
   */
  lockById(tx: Transaction, tenantId: string, id: string): Promise<Customer | null>;

  insert(
    tx: Transaction,
    tenantId: string,
    details: CustomerDetails,
    createdBy: string,
  ): Promise<Customer>;

  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: CustomerPatch,
  ): Promise<Customer | null>;
}
