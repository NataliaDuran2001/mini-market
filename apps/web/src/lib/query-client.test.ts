import { describe, expect, it } from 'vitest';
import { createQueryClient } from './query-client';

describe('createQueryClient', () => {
  it('retries once and keeps data fresh for 30 seconds', () => {
    const defaults = createQueryClient().getDefaultOptions().queries;
    expect(defaults?.retry).toBe(1);
    expect(defaults?.staleTime).toBe(30_000);
  });
});
