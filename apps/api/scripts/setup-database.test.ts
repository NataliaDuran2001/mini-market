import { describe, expect, it } from 'vitest';
import { appUserPasswordFrom, sqlLiteral } from './setup-database';

describe('appUserPasswordFrom', () => {
  it('reads and decodes the password of the app_user pooler URL', () => {
    // AC-3
    expect(appUserPasswordFrom('postgresql://app_user.ref:p%40ss%2Fw@host:6543/postgres')).toBe(
      'p@ss/w',
    );
  });

  it('refuses a URL of another role, so the owner password is never set on app_user', () => {
    expect(appUserPasswordFrom('postgresql://postgres.ref:secret@host:5432/postgres')).toBe(
      undefined,
    );
  });

  it('returns undefined for a missing or malformed URL', () => {
    expect(appUserPasswordFrom(undefined)).toBe(undefined);
    expect(appUserPasswordFrom('not a url')).toBe(undefined);
    expect(appUserPasswordFrom('postgresql://app_user.ref@host/postgres')).toBe(undefined);
  });
});

describe('sqlLiteral', () => {
  it('doubles single quotes so a password cannot end the literal', () => {
    expect(sqlLiteral("a'b''c")).toBe("'a''b''''c'");
  });
});
