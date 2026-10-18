import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { publishAfterCommit } from '../../src/infrastructure/events/domain-event-bus';
import type { DomainEvent } from '../../src/infrastructure/events/domain-event-bus';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

const FIXTURE_MIGRATIONS = path.resolve(__dirname, '../fixtures/migrations');

describe('test harness', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb({ migrationsFolder: FIXTURE_MIGRATIONS });
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('applies the migrations to a fresh PGlite', async () => {
    // AC-4
    const { rows } = await testDb.client.query<{ exists: boolean }>(
      "select to_regclass('public.harness_probe') is not null as exists",
    );
    expect(rows[0]?.exists).toBe(true);
  });

  it('starts every file with its own empty database and truncates between tests', async () => {
    // AC-4
    await testDb.client.exec("insert into harness_probe (label) values ('a'), ('b')");
    await testDb.truncateAll();
    const { rows } = await testDb.client.query<{ n: number }>(
      'select count(*)::int as n from harness_probe',
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('boots without migrations when the folder has no journal yet', async () => {
    const empty = await createTestDb();
    const { rows } = await empty.client.query<{ n: number }>('select 1 as n');
    expect(rows[0]?.n).toBe(1);
    await empty.close();
  });
});

describe('withTransaction', () => {
  const orderPlaced: DomainEvent = { type: 'OrderPlaced' };
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb({ migrationsFolder: FIXTURE_MIGRATIONS });
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
  });

  it('commits the work and dispatches the queued events after commit', async () => {
    // ADR 0014
    const received: string[] = [];
    testDb.bus.subscribe('OrderPlaced', async () => {
      const { rows } = await testDb.client.query<{ n: number }>(
        'select count(*)::int as n from harness_probe',
      );
      received.push(`rows visible to handler: ${rows[0]?.n ?? -1}`);
    });
    const ctx = { events: [] as DomainEvent[] };

    await testDb.withTransaction(ctx, async (tx) => {
      await tx.execute(sql`insert into harness_probe (label) values ('committed')`);
      publishAfterCommit(ctx, orderPlaced);
      expect(received).toEqual([]); // nothing is dispatched while the transaction is open
    });

    expect(received).toEqual(['rows visible to handler: 1']);
    expect(ctx.events).toEqual([]);
  });

  it('rolls back and discards queued events when the work throws', async () => {
    // ADR 0014
    let dispatched = 0;
    testDb.bus.subscribe('OrderPlaced', () => void dispatched++);
    const ctx = { events: [] as DomainEvent[] };

    await expect(
      testDb.withTransaction(ctx, async (tx) => {
        await tx.execute(sql`insert into harness_probe (label) values ('rolled back')`);
        publishAfterCommit(ctx, orderPlaced);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const { rows } = await testDb.client.query<{ n: number }>(
      'select count(*)::int as n from harness_probe',
    );
    expect(rows[0]?.n).toBe(0);
    expect(dispatched).toBe(0);
    expect(ctx.events).toEqual([]);
  });

  it('runs without a context for work that is not tenant scoped', async () => {
    const result = await testDb.withTransaction(null, () => Promise.resolve('done'));
    expect(result).toBe('done');
  });
});
