/** A supplier (proveedor) of one tenant: who goods are bought from and who is owed (S9). */
export interface Supplier {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly taxId: string | null;
  readonly notes: string | null;
  /** A supplier is never deleted: an inactive one leaves the pickers and keeps its history. */
  readonly active: boolean;
}

export interface SupplierDetails {
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly taxId: string | null;
  readonly notes: string | null;
}

/** The fields an update may change; a missing key keeps the stored value, `null` clears it. */
export type SupplierDetailsPatch = Partial<SupplierDetails>;
