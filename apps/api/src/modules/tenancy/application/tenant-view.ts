import type { TenantSettings } from '../domain/tenant';

/** What the use cases return: the tenant with validated settings. */
export interface TenantView {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly settings: TenantSettings;
}
