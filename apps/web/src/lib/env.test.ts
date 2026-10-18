import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const valid = {
  VITE_API_URL: 'http://localhost:3001',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
};

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(valid)).toEqual(valid);
  });

  it('lists the invalid variable names without leaking their values', () => {
    const secret = 'super-secret-value';
    expect(() =>
      parseEnv({ ...valid, VITE_API_URL: secret, VITE_SUPABASE_ANON_KEY: '' }),
    ).toThrowError(/VITE_API_URL, VITE_SUPABASE_ANON_KEY/);
    expect(() => parseEnv({ ...valid, VITE_API_URL: secret })).not.toThrowError(secret);
  });

  it('rejects a missing variable', () => {
    const { VITE_SUPABASE_URL: _omitted, ...incomplete } = valid;
    expect(() => parseEnv(incomplete)).toThrowError(/VITE_SUPABASE_URL/);
  });
});
