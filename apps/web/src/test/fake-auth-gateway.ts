import type { AuthGateway, AuthResult, AuthSession } from '@/lib/auth/auth-gateway';

export const TEST_ACCESS_TOKEN = 'test-access-token';
export const TEST_USER: AuthSession = {
  userId: '00000000-0000-4000-8000-0000000000a1',
  email: 'ana@example.com',
};

export interface FakeAuthGateway extends AuthGateway {
  /** Passwords sent to updatePassword, in order. */
  readonly passwordUpdates: string[];
  /** Reset requests made through requestPasswordReset. */
  readonly resetRequests: { email: string; redirectTo: string }[];
  /** Ends the session as the provider would after expiry, notifying listeners. */
  expireSession(): void;
}

/**
 * In-memory stand-in for the identity provider. `accounts` maps email to password; signing in with
 * a pair that is not listed fails with INVALID_CREDENTIALS.
 */
export function createFakeAuthGateway(
  options: {
    session?: AuthSession | null;
    accounts?: Readonly<Record<string, string>>;
  } = {},
): FakeAuthGateway {
  let session: AuthSession | null = options.session ?? null;
  const accounts = options.accounts ?? { [TEST_USER.email]: 'correct-horse' };
  const listeners = new Set<(next: AuthSession | null) => void>();
  const passwordUpdates: string[] = [];
  const resetRequests: { email: string; redirectTo: string }[] = [];

  const setSession = (next: AuthSession | null) => {
    session = next;
    listeners.forEach((listener) => {
      listener(next);
    });
  };

  return {
    passwordUpdates,
    resetRequests,
    getSession: () => Promise.resolve(session),
    getAccessToken: () => Promise.resolve(session ? TEST_ACCESS_TOKEN : null),
    onSessionChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    signInWithPassword({ email, password }): Promise<AuthResult> {
      if (accounts[email] !== password) {
        return Promise.resolve({ ok: false, code: 'INVALID_CREDENTIALS' });
      }
      setSession({ userId: TEST_USER.userId, email });
      return Promise.resolve({ ok: true });
    },
    signOut() {
      setSession(null);
      return Promise.resolve();
    },
    requestPasswordReset(input) {
      resetRequests.push(input);
      return Promise.resolve({ ok: true });
    },
    updatePassword(password): Promise<AuthResult> {
      if (!session) return Promise.resolve({ ok: false, code: 'SESSION_MISSING' });
      passwordUpdates.push(password);
      return Promise.resolve({ ok: true });
    },
    expireSession() {
      setSession(null);
    },
  };
}
