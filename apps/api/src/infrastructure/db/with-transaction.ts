import type { DomainEventBus, EventCollector } from '../events/domain-event-bus';
import type { Database, Transaction } from './database';

/**
 * Runs `fn` in one database transaction (docs/02 section 7). Events the use case queued on `ctx`
 * are dispatched after commit and discarded on rollback (every event on `ctx` belongs to the
 * transaction that is running). Tenant binding (`set_config`) arrives with issue #12; until then
 * `ctx` only carries the event buffer.
 */
export type WithTransaction = <T>(
  ctx: EventCollector | null,
  fn: (tx: Transaction) => Promise<T>,
) => Promise<T>;

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

export function createWithTransaction(db: Database, bus: DomainEventBus): WithTransaction {
  return async (ctx, fn) => {
    const result = await db
      .transaction((tx) => fn(tx))
      .catch((error: unknown) => {
        ctx?.events.splice(0);
        throw error;
      });
    if (ctx) {
      await dispatchQueued(ctx, bus);
    }
    return result;
  };
}
