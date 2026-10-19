import type { Transaction } from '../../../../infrastructure/db/database';
import type { Supplier, SupplierDetails, SupplierDetailsPatch } from '../../domain/supplier';

export interface SupplierFilter {
  /** Matches name, phone, email and tax id, ignoring case. */
  readonly q?: string | undefined;
  readonly active?: boolean | undefined;
}

/**
 * Suppliers of a tenant. Every method takes `tenantId` and puts it in the query, so a wrong id can
 * only miss, never reach another tenant; row level security is the second wall.
 */
export interface SupplierRepository {
  /** Serializes the name changes of one tenant until the transaction ends (unique names). */
  lockNames(tx: Transaction, tenantId: string): Promise<void>;

  /** Ordered by name. */
  list(tx: Transaction, tenantId: string, filter: SupplierFilter): Promise<readonly Supplier[]>;

  findById(tx: Transaction, tenantId: string, id: string): Promise<Supplier | null>;

  /** True when another supplier (not `exceptId`) has this name, ignoring case. */
  nameTaken(tx: Transaction, tenantId: string, name: string, exceptId?: string): Promise<boolean>;

  insert(
    tx: Transaction,
    tenantId: string,
    details: SupplierDetails,
    createdBy: string,
  ): Promise<Supplier>;

  update(
    tx: Transaction,
    tenantId: string,
    id: string,
    patch: SupplierDetailsPatch & { readonly active?: boolean },
  ): Promise<Supplier | null>;
}
