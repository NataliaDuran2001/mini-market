import type { DomainEventBus, EventCollector } from '../events/domain-event-bus';
import type { Database, Transaction } from './database';

/**
 * Runs `fn` in one database transaction (docs/02 section 7). Events the use case queued on `ctx`
 * are dispatched after commit and discarded on rollback. Tenant binding (`set_config`) arrives
 * with issue #12; until then `ctx` only carries the event buffer.
 */
export type WithTransaction = <T>(
  ctx: EventCollector | null,
  fn: (tx: Transaction) => Promise<T>,
) => Promise<T>;

export function createWithTransaction(db: Database, bus: DomainEventBus): WithTransaction {
  return async (ctx, fn) => {
    const result = await db
      .transaction((tx) => fn(tx))
      .catch((error: unknown) => {
        ctx?.events.splice(0);
        throw error;
      });
    if (ctx) {
      await bus.dispatch(ctx.events.splice(0));
    }
    return result;
  };
}
