import type { TenantSettings } from '../domain/tenant';

/**
 * What tenancy use cases need to know about the caller. The access module's `TenantContext`
 * (issue #11) carries these fields and more, so it satisfies this type structurally. Tenancy sits
 * below access in the dependency graph, hence it declares what it needs instead of importing it.
 */
export interface TenantScope {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: 'owner' | 'employee';
  /** Settings snapshot taken when the request was resolved. */
  readonly settings: TenantSettings;
  /** After-commit event buffer of the running transaction (ADR 0014). */
  readonly events: { readonly type: string }[];
  /** Whether the caller holds a permission of the matrix, for example `settings.write`. */
  can(permission: string): boolean;
}
