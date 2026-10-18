/** A fact that happened in a module. PascalCase, past tense: `SaleConfirmed` (ADR 0014). */
export interface DomainEvent {
  readonly type: string;
}

/** Handlers must be idempotent: dispatch happens after commit and is not retried (ADR 0014). */
export type DomainEventHandler = (event: DomainEvent) => Promise<void> | void;

/** Anything that buffers events during a transaction; `TenantContext` is one (issue #11). */
export interface EventCollector {
  readonly events: DomainEvent[];
}

export type HandlerFailureReporter = (event: DomainEvent, error: unknown) => void;

/** In-process event bus. Events buffered in a transaction are dispatched after it commits. */
export class DomainEventBus {
  private readonly handlers = new Map<string, DomainEventHandler[]>();

  constructor(private readonly reportFailure: HandlerFailureReporter = () => undefined) {}

  /** @returns a function that removes the subscription */
  subscribe(type: string, handler: DomainEventHandler): () => void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler]);
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(
        type,
        current.filter((candidate) => candidate !== handler),
      );
    };
  }

  private report(event: DomainEvent, error: unknown): void {
    try {
      this.reportFailure(event, error);
    } catch {
      // Reporting must never turn a committed write into a failed request.
    }
  }

  /**
   * Delivers events in order. A failing handler is reported and isolated: it never affects the
   * committed write or the other handlers.
   */
  async dispatch(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const handler of this.handlers.get(event.type) ?? []) {
        try {
          await handler(event);
        } catch (error) {
          this.report(event, error);
        }
      }
    }
  }
}

/** Queues an event on the collector; it is dispatched only if the transaction commits. */
export function publishAfterCommit(collector: EventCollector, event: DomainEvent): void {
  collector.events.push(event);
}
