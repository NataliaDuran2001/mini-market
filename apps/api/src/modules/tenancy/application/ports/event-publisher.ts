import type { TenancyEvent } from '../../domain/tenant-events';

/** Delivers events that happened after their data was committed (ADR 0014, ADR 0016). */
export interface EventPublisher {
  publish(events: readonly TenancyEvent[]): Promise<void>;
}
