/** A customer (cliente) of one tenant: someone who buys "al fiado" and owes a balance (S6). */
export interface Customer {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly documentId: string | null;
  /** Centavos; `null` means no limit. Only the owner changes it. */
  readonly creditLimitCentavos: bigint | null;
  readonly notes: string | null;
  /** A customer is never deleted: an inactive one cannot buy on credit and keeps its history. */
  readonly active: boolean;
}

export interface CustomerDetails {
  readonly name: string;
  readonly phone: string | null;
  readonly documentId: string | null;
  readonly creditLimitCentavos: bigint | null;
  readonly notes: string | null;
}

/** The fields an update may change; a missing key keeps the stored value, `null` clears it. */
export type CustomerPatch = Partial<CustomerDetails> & { readonly active?: boolean };
