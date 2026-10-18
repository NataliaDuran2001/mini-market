import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthGateway, toAuthErrorCode } from './supabase-auth-gateway';

type ErrorShape = Pick<AuthError, 'code' | 'name' | 'status'>;
const error = (shape: Partial<ErrorShape>): ErrorShape => ({
  code: undefined,
  name: 'AuthApiError',
  status: 400,
  ...shape,
});

describe('toAuthErrorCode', () => {
  it.each([
    [error({ code: 'invalid_credentials' }), 'INVALID_CREDENTIALS'],
    [error({ code: 'email_not_confirmed' }), 'EMAIL_NOT_CONFIRMED'],
    [error({ code: 'weak_password' }), 'WEAK_PASSWORD'],
    [error({ code: 'same_password' }), 'SAME_PASSWORD'],
    [error({ code: 'over_email_send_rate_limit' }), 'RATE_LIMITED'],
    [error({ name: 'AuthSessionMissingError' }), 'SESSION_MISSING'],
    [error({ name: 'AuthRetryableFetchError', status: 0 }), 'NETWORK_ERROR'],
    [error({ code: 'something_new' }), 'UNKNOWN_ERROR'],
  ] as const)('maps %j to %s', (input, expected) => {
    expect(toAuthErrorCode(input)).toBe(expected);
  });
});

function fakeClient(auth: Partial<SupabaseClient['auth']>): Pick<SupabaseClient, 'auth'> {
  // as: only the auth methods the gateway calls are provided by these fakes.
  return { auth: auth as SupabaseClient['auth'] };
}

const session = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'ana@example.com' },
} as Session; // as: the gateway reads only access_token and user.id/email

describe('createSupabaseAuthGateway', () => {
  it('exposes the user id and email and the access token of the current session', async () => {
    const gateway = createSupabaseAuthGateway(
      fakeClient({ getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) }),
    );
    expect(await gateway.getSession()).toEqual({ userId: 'user-1', email: 'ana@example.com' });
    expect(await gateway.getAccessToken()).toBe('token-123');
  });

  it('returns nulls when there is no session', async () => {
    const gateway = createSupabaseAuthGateway(
      fakeClient({
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      }),
    );
    expect(await gateway.getSession()).toBeNull();
    expect(await gateway.getAccessToken()).toBeNull();
  });

  it('turns a failed sign in into a stable code, never provider text', async () => {
    const gateway = createSupabaseAuthGateway(
      fakeClient({
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {},
          error: error({ code: 'invalid_credentials' }),
        }),
      }),
    );
    expect(await gateway.signInWithPassword({ email: 'a@b.co', password: 'x' })).toEqual({
      ok: false,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('signs out of this device only and unsubscribes listeners', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } });
    const gateway = createSupabaseAuthGateway(fakeClient({ signOut, onAuthStateChange }));

    await gateway.signOut();
    gateway.onSessionChange(() => undefined)();

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
