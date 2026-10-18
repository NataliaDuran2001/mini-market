import {
  createClient,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type { AuthErrorCode, AuthGateway, AuthResult, AuthSession } from './auth-gateway';

/** Browser client with the public anon key only. The service role key never reaches the web. */
export function createSupabaseClient(config: {
  readonly url: string;
  readonly anonKey: string;
}): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

const KNOWN_CODES: Readonly<Record<string, AuthErrorCode>> = {
  invalid_credentials: 'INVALID_CREDENTIALS',
  email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
  weak_password: 'WEAK_PASSWORD',
  same_password: 'SAME_PASSWORD',
  over_request_rate_limit: 'RATE_LIMITED',
  over_email_send_rate_limit: 'RATE_LIMITED',
  session_not_found: 'SESSION_MISSING',
  session_expired: 'SESSION_MISSING',
};

export function toAuthErrorCode(error: Pick<AuthError, 'code' | 'name' | 'status'>): AuthErrorCode {
  const known = error.code ? KNOWN_CODES[error.code] : undefined;
  if (known) return known;
  if (error.name === 'AuthSessionMissingError') return 'SESSION_MISSING';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'NETWORK_ERROR';
  return 'UNKNOWN_ERROR';
}

function toResult(error: AuthError | null): AuthResult {
  return error ? { ok: false, code: toAuthErrorCode(error) } : { ok: true };
}

function toSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  return { userId: session.user.id, email: session.user.email ?? '' };
}

export function createSupabaseAuthGateway(client: Pick<SupabaseClient, 'auth'>): AuthGateway {
  const { auth } = client;
  return {
    async getSession() {
      const { data } = await auth.getSession();
      return toSession(data.session);
    },
    async getAccessToken() {
      const { data } = await auth.getSession();
      return data.session?.access_token ?? null;
    },
    onSessionChange(listener) {
      const { data } = auth.onAuthStateChange((_event, session) => {
        listener(toSession(session));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },
    async signInWithPassword(input) {
      const { error } = await auth.signInWithPassword(input);
      return toResult(error);
    },
    async signOut() {
      await auth.signOut({ scope: 'local' });
    },
    async requestPasswordReset({ email, redirectTo }) {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
      return toResult(error);
    },
    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      return toResult(error);
    },
  };
}
