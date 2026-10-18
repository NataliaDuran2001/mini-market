import { describe, expect, it, vi } from 'vitest';
import { DomainEventBus, publishAfterCommit } from './domain-event-bus';
import type { DomainEvent } from './domain-event-bus';

const saleConfirmed: DomainEvent = { type: 'SaleConfirmed' };

describe('DomainEventBus', () => {
  it('delivers events in order to the handlers subscribed to their type', async () => {
    const bus = new DomainEventBus();
    const seen: string[] = [];
    bus.subscribe('SaleConfirmed', (event) => void seen.push(`a:${event.type}`));
    bus.subscribe('SaleConfirmed', (event) => void seen.push(`b:${event.type}`));
    bus.subscribe('StockBelowMinimum', () => void seen.push('other'));

    await bus.dispatch([saleConfirmed]);

    expect(seen).toEqual(['a:SaleConfirmed', 'b:SaleConfirmed']);
  });

  it('isolates a failing handler: it is reported and the others still run (ADR 0014)', async () => {
    const reportFailure = vi.fn();
    const bus = new DomainEventBus(reportFailure);
    const survivor = vi.fn();
    bus.subscribe('SaleConfirmed', () => {
      throw new Error('boom');
    });
    bus.subscribe('SaleConfirmed', survivor);

    await expect(bus.dispatch([saleConfirmed])).resolves.toBeUndefined();

    expect(survivor).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(saleConfirmed, expect.any(Error));
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('SaleConfirmed', handler);
    unsubscribe();

    await bus.dispatch([saleConfirmed]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('publishAfterCommit only queues on the collector', () => {
    const collector = { events: [] as DomainEvent[] };
    publishAfterCommit(collector, saleConfirmed);
    expect(collector.events).toEqual([saleConfirmed]);
  });
});
