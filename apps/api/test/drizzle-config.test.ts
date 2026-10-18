import { describe, expect, it } from 'vitest';
import drizzleConfig from '../drizzle.config';

describe('drizzle.config.ts', () => {
  it('names migrations with a timestamp prefix so parallel lanes never collide', () => {
    // parallel-lane convention of issue #3
    expect(drizzleConfig.migrations).toMatchObject({ prefix: 'timestamp' });
  });

  it('reads the schema registry and writes to apps/api/drizzle', () => {
    expect(drizzleConfig).toMatchObject({
      dialect: 'postgresql',
      schema: './src/infrastructure/db/schema.ts',
      out: './drizzle',
      casing: 'snake_case',
    });
  });
});
