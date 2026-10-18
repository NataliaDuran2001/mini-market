import type { TenantSettings } from '../../tenancy';
import type { Role } from './identity';
import type { PermissionName } from './permissions';

/** Anything with a `type` can be queued; `DomainEvent` of the infrastructure is one. */
export interface QueuedEvent {
  readonly type: string;
}

export interface TenantContextInit {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
  /** Settings of the tenant as they were when the request was resolved. */
  readonly settings: TenantSettings;
  /** Permissions the role holds under `settings`, from the registry. */
  readonly permissions: readonly PermissionName[];
}

/**
 * Who is acting, in which tenant, with which role and permissions. Built once per request by the
 * tenant guard and passed explicitly to every use case and repository (ADR 0016); never read from
 * a global. `can` is the use case side of authorization (defense in depth next to
 * `@RequirePermission`).
 */
export class TenantContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly role: Role;
  readonly settings: TenantSettings;
  readonly permissions: readonly PermissionName[];
  /** After-commit event buffer of the running transaction (ADR 0014). */
  readonly events: QueuedEvent[] = [];
  private readonly granted: ReadonlySet<PermissionName>;

  constructor(init: TenantContextInit) {
    this.tenantId = init.tenantId;
    this.userId = init.userId;
    this.role = init.role;
    this.settings = init.settings;
    this.permissions = init.permissions;
    this.granted = new Set(init.permissions);
  }

  /** An unknown permission is denied: a typo can only lock someone out, never let them in. */
  can(permission: PermissionName): boolean {
    return this.granted.has(permission);
  }

  /** Queues an event for dispatch after the transaction commits. */
  publishAfterCommit(event: QueuedEvent): void {
    this.events.push(event);
  }
}
