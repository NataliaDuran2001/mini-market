import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://app:secret-password@localhost:5432/db',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_JWT_ISSUER: 'http://localhost:54321/auth/v1',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  WEB_ORIGIN: 'http://localhost:5173',
};

function failureOf(source: Record<string, string | undefined>): EnvValidationError {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('loadEnv did not throw');
}

describe('loadEnv', () => {
  it('lists the invalid keys when DATABASE_URL is missing', () => {
    // AC-1
    const { DATABASE_URL: _removed, ...withoutDatabaseUrl } = validEnv;
    const error = failureOf(withoutDatabaseUrl);
    expect(error.invalidKeys).toEqual(['DATABASE_URL']);
    expect(error.message).toContain('Invalid environment variables');
    expect(error.message).toContain('DATABASE_URL');
  });

  it('treats an empty string as missing and reports every invalid key at once', () => {
    // AC-1
    const error = failureOf({ ...validEnv, DATABASE_URL: '', WEB_ORIGIN: 'not a url' });
    expect([...error.invalidKeys].sort()).toEqual(['DATABASE_URL', 'WEB_ORIGIN']);
  });

  it('never repeats a value in its message', () => {
    // docs/05-security.md: no secrets in logs
    const error = failureOf({ ...validEnv, DATABASE_URL: 'mysql://user:hunter2@host/db' });
    expect(error.message).not.toContain('hunter2');
  });

  it('accepts a complete environment and applies defaults', () => {
    // AC-1 (accept fixture)
    const env = loadEnv(validEnv);
    expect(env).toMatchObject({ nodeEnv: 'test', logLevel: 'info', port: 3001 });
  });

  it('picks the port from API_PORT, then PORT, then 3001', () => {
    // parallel-lane convention of issue #3
    expect(loadEnv({ ...validEnv, API_PORT: '3101', PORT: '8080' }).port).toBe(3101);
    expect(loadEnv({ ...validEnv, PORT: '8080' }).port).toBe(8080);
    expect(loadEnv(validEnv).port).toBe(3001);
  });

  it('rejects a port outside the valid range', () => {
    expect(failureOf({ ...validEnv, API_PORT: '70000' }).invalidKeys).toEqual(['API_PORT']);
  });
});
