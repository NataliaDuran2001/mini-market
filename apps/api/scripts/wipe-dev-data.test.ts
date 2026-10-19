import { describe, expect, it } from 'vitest';
import { confirmedProjectRef, sameProject, wipeRefusal } from './wipe-dev-data';

const REF = 'abcdefghijklmnopqrst';
const input = {
  argv: ['--confirm-project', REF],
  ownerUrl: `postgresql://postgres.${REF}:pw@pooler:5432/postgres`,
  supabaseUrl: `https://${REF}.supabase.co`,
  nodeEnv: 'development',
};

describe('wipeRefusal', () => {
  it('lets the wipe run only when the typed ref is the ref of the environment', () => {
    expect(wipeRefusal(input)).toBeUndefined();
  });

  it('refuses a missing or different ref, another project and production', () => {
    expect(wipeRefusal({ ...input, argv: [] })).toMatch(/does not match/);
    expect(wipeRefusal({ ...input, argv: ['--confirm-project', 'zzzzzzzzzzzzzzzzzzzz'] })).toMatch(
      /does not match/,
    );
    expect(wipeRefusal({ ...input, supabaseUrl: 'https://other.supabase.co' })).toMatch(
      /different projects/,
    );
    expect(wipeRefusal({ ...input, nodeEnv: 'production' })).toMatch(/NODE_ENV=production/);
  });

  it('does not echo the ref of the environment in a refusal', () => {
    expect(wipeRefusal({ ...input, argv: [] })).not.toContain(REF);
  });
});

describe('confirmedProjectRef', () => {
  it('reads the value after the flag only', () => {
    expect(confirmedProjectRef(['--', '--confirm-project', 'x'])).toBe('x');
    expect(confirmedProjectRef(['--yes'])).toBeUndefined();
  });
});

describe('sameProject', () => {
  const supabaseUrl = 'https://abcdefghijklmnopqrst.supabase.co';

  it('accepts the owner URL of the project in SUPABASE_URL', () => {
    expect(
      sameProject(
        'postgresql://postgres.abcdefghijklmnopqrst:pw@pooler:5432/postgres',
        supabaseUrl,
      ),
    ).toBe(true);
  });

  it('refuses another project, a user without a ref and malformed URLs', () => {
    expect(
      sameProject(
        'postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:pw@pooler:5432/postgres',
        supabaseUrl,
      ),
    ).toBe(false);
    expect(sameProject('postgresql://postgres:pw@localhost:5432/postgres', supabaseUrl)).toBe(
      false,
    );
    expect(sameProject('nope', supabaseUrl)).toBe(false);
  });
});
