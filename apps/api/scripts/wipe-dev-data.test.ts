import { describe, expect, it } from 'vitest';
import { sameProject } from './wipe-dev-data';

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
