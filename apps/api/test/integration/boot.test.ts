import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = path.resolve(__dirname, '../..');

/** Environment variables Node itself needs to start, and nothing else. */
function minimalSystemEnv(): Record<string, string> {
  const keep = [
    'PATH',
    'Path',
    'SystemRoot',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    // SWC unpacks its native addon into the user cache directory
    'LOCALAPPDATA',
    'APPDATA',
    'XDG_CACHE_HOME',
    'SWC_NATIVE_BINDING_CACHE',
  ];
  return Object.fromEntries(
    keep.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
  );
}

describe('API process', () => {
  it('exits non-zero with the list of invalid keys when DATABASE_URL is missing', () => {
    // AC-1
    const result = spawnSync(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], {
      cwd: apiRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...minimalSystemEnv(),
        ENV_FILE: path.join(apiRoot, 'no-such.env'), // never read a developer's local .env here
        NODE_ENV: 'test',
        SUPABASE_URL: 'http://localhost:54321',
        SUPABASE_JWT_ISSUER: 'http://localhost:54321/auth/v1',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        WEB_ORIGIN: 'http://localhost:5173',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid environment variables');
    expect(result.stderr).toContain('DATABASE_URL');
    expect(result.stderr).not.toContain('SUPABASE_URL');
  });
});
