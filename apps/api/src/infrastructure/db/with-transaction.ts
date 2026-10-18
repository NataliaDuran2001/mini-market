import { sql } from 'drizzle-orm';
import type { DomainEventBus, EventCollector } from '../events/domain-event-bus';
import type { Database, Transaction } from './database';

/**
 * Who a transaction acts for. `TenantContext` satisfies it. Row level security reads `tenantId`
 * and `userId` from the transaction (`app.tenant_id`, `app.user_id`); a scope without them sees no
 * row of a tenant table (docs/05-security.md section 1, ADR 0001).
 */
export interface TransactionScope extends EventCollector {
  readonly tenantId?: string | undefined;
  /** Lets a user read their own memberships and tenants before any tenant is chosen. */
  readonly userId?: string | undefined;
}

/**
 * Runs `fn` in one database transaction (docs/02 section 7). The first statements bind the scope
 * to the transaction with `set_config(..., true)`, so the binding ends with it and is safe behind
 * the Supabase pooler in transaction mode. Events the use case queued on `scope` are dispatched
 * after commit and discarded on rollback. With `null` nothing is bound: tenant tables answer zero
 * rows and reject writes (fail closed).
 */
export type WithTransaction = <T>(
  scope: TransactionScope | null,
  fn: (tx: Transaction) => Promise<T>,
) => Promise<T>;

export interface WithTransactionOptions {
  /**
   * Switch to this role at the start of every transaction (`SET LOCAL ROLE`). Production connects
   * as `app_user` already; tests run on a PGlite superuser connection and use this to get the same
   * row level security.
   */
  readonly assumeRole?: string;
}

/** Events a handler publishes while handling are delivered in the next round. */
const MAX_DISPATCH_ROUNDS = 10;

async function dispatchQueued(ctx: EventCollector, bus: DomainEventBus): Promise<void> {
  for (let round = 0; round < MAX_DISPATCH_ROUNDS && ctx.events.length > 0; round++) {
    await bus.dispatch(ctx.events.splice(0));
  }
  // Still queued after the last round means handlers keep publishing: a bug. Never carry those
  // events into the next transaction that reuses this context.
  ctx.events.splice(0);
}

async function bindScope(
  tx: Transaction,
  scope: TransactionScope | null,
  options: WithTransactionOptions,
): Promise<void> {
  if (options.assumeRole) {
    await tx.execute(sql`select set_config('role', ${options.assumeRole}, true)`);
  }
  if (scope?.tenantId) {
    await tx.execute(sql`select set_config('app.tenant_id', ${scope.tenantId}, true)`);
  }
  if (scope?.userId) {
    await tx.execute(sql`select set_config('app.user_id', ${scope.userId}, true)`);
  }
}

export function createWithTransaction(
  db: Database,
  bus: DomainEventBus,
  options: WithTransactionOptions = {},
): WithTransaction {
  return async (scope, fn) => {
    const result = await db
      .transaction(async (tx) => {
        await bindScope(tx, scope, options);
        return fn(tx);
      })
      .catch((error: unknown) => {
        scope?.events.splice(0);
        throw error;
      });
    if (scope) {
      await dispatchQueued(scope, bus);
    }
    return result;
  };
}
