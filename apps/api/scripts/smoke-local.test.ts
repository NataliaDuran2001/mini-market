import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSmoke } from './smoke-local';

const CONFIG_KEYS = [
  'MIGRATION_DATABASE_URL',
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SMOKE_OWNER_PASSWORD',
];

describe('runSmoke', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('exits non-zero and says what is missing when the environment is incomplete', async () => {
    // AC-7: the failure path of the smoke run, without any network access
    for (const key of CONFIG_KEYS) vi.stubEnv(key, '');
    const lines: string[] = [];
    const code = await runSmoke((line) => lines.push(line));
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/^FAIL {2}configuration \(missing: .*pnpm setup:env/);
  });

  it('never prints a value of the environment it was given', async () => {
    // AC-2, AC-7: a partial environment with sentinel values
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sentinel-service-key');
    vi.stubEnv('DATABASE_URL', 'postgresql://app_user.ref:sentinel-password@host:6543/postgres');
    vi.stubEnv('MIGRATION_DATABASE_URL', '');
    const lines: string[] = [];
    expect(await runSmoke((line) => lines.push(line))).toBe(1);
    const output = lines.join('\n');
    expect(output).not.toContain('sentinel-service-key');
    expect(output).not.toContain('sentinel-password');
  });
});
