import type { LucideIcon } from 'lucide-react';

/** Tenant module flags that switch a feature on or off (ADR 0006). */
export type TenantModule = 'lots' | 'fractional' | 'credit_sales' | 'custom_fields';

/**
 * One entry of the app navigation. A feature registers its entries by exporting
 * `navigation: readonly NavigationItem[]` from `src/features/<feature>/navigation.ts`; the shell
 * collects those files, so no central list is edited when a feature is added. An entry with the
 * same `id` as a default entry replaces it.
 */
export interface NavigationItem {
  /** Stable key; also how a feature overrides a default entry. */
  readonly id: string;
  readonly path: string;
  /** i18n key with namespace, for example `shell:nav.sales`. */
  readonly labelKey: string;
  readonly icon: LucideIcon;
  /** `tab` entries sit on the mobile bottom bar; `more` entries go behind "Más". */
  readonly placement: 'tab' | 'more';
  readonly order: number;
  /** Hidden for people who do not hold it (UI convenience; the API enforces). */
  readonly permission?: string;
  /** Hidden when the tenant has the module switched off. */
  readonly module?: TenantModule;
}
