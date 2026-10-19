import type { ConflictError, DomainError, NotFoundError, Result } from '@mini-market/shared-kernel';
import type { TenantSettings } from '../../domain/tenant';
import type { TenantScope } from '../tenant-scope';

/** A tenant row as persisted. `settings` is raw JSON: the use case validates it on every read. */
export interface StoredTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly settings: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NewTenant {
  readonly slug: string;
  readonly name: string;
  readonly settings: TenantSettings;
  readonly createdAt: Date;
}

/**
 * The tenant of a request is always `ctx.tenantId`: no method reads another tenant by id, so a
 * caller cannot reach a neighbour by passing the wrong id (docs/05-security.md).
 */
export interface TenantRepository {
  /** Provisioning: there is no tenant context yet. A taken slug is a Conflict. */
  create(tenant: NewTenant): Promise<Result<StoredTenant, ConflictError>>;

  /** Provisioning: looks a tenant up by its slug, with no tenant context (owner role only). */
  findBySlug(slug: string): Promise<StoredTenant | null>;

  findById(ctx: TenantScope): Promise<StoredTenant | null>;

  /**
   * Locks the row of `ctx.tenantId`, passes it to `change` and stores the settings it returns, all
   * in one transaction, so two concurrent patches never lose each other's changes. An Err from
   * `change` is returned as is; `change` must not queue events or have side effects before it returns Err. `change` may queue events on `ctx.events`.
   */
  updateSettings<E extends DomainError>(
    ctx: TenantScope,
    change: (current: StoredTenant) => Result<TenantSettings, E>,
    now: Date,
  ): Promise<Result<StoredTenant, E | NotFoundError>>;
}
