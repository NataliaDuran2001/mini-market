import { inspect } from 'node:util';
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

  it('defaults NODE_ENV to production so a forgotten variable fails safe', () => {
    // docs/05-security.md section 4: Swagger UI only outside production
    const { NODE_ENV: _removed, ...withoutNodeEnv } = validEnv;
    expect(loadEnv(withoutNodeEnv).nodeEnv).toBe('production');
  });

  it('normalizes WEB_ORIGIN to an origin and rejects one with a path', () => {
    // docs/05-security.md section 4: CORS equals the exact web origin
    expect(loadEnv({ ...validEnv, WEB_ORIGIN: 'http://localhost:5173/' }).webOrigin).toBe(
      'http://localhost:5173',
    );
    expect(failureOf({ ...validEnv, WEB_ORIGIN: 'http://localhost:5173/app' }).invalidKeys).toEqual(
      ['WEB_ORIGIN'],
    );
  });

  it('requires https for every URL except localhost', () => {
    // docs/05-security.md: HTTPS only in all environments (a plain http JWKS URL can be spoofed)
    const insecure = failureOf({
      ...validEnv,
      SUPABASE_URL: 'http://project.supabase.co',
      SUPABASE_JWT_ISSUER: 'http://project.supabase.co/auth/v1',
      WEB_ORIGIN: 'http://app.example.com',
    });
    expect([...insecure.invalidKeys].sort()).toEqual([
      'SUPABASE_JWT_ISSUER',
      'SUPABASE_URL',
      'WEB_ORIGIN',
    ]);
    const secure = loadEnv({
      ...validEnv,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
      WEB_ORIGIN: 'https://app.example.com',
    });
    expect(secure.supabaseUrl).toBe('https://project.supabase.co');
    expect(loadEnv({ ...validEnv, WEB_ORIGIN: 'http://127.0.0.1:5173' }).webOrigin).toBe(
      'http://127.0.0.1:5173',
    );
  });

  it('keeps the database url and the service role key out of JSON and inspect output', () => {
    // docs/05-security.md section 5
    const env = loadEnv(validEnv);
    expect(env.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(env.supabaseServiceRoleKey).toBe(validEnv.SUPABASE_SERVICE_ROLE_KEY);
    const printed = `${JSON.stringify(env)} ${inspect(env)} ${JSON.stringify({ ...env })}`;
    expect(printed).not.toContain('secret-password');
    expect(printed).not.toContain('service-role-key');
  });
});
