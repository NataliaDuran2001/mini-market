/** The signed-in person as the web needs to know them. Tokens never leave the gateway. */
export interface AuthSession {
  readonly userId: string;
  readonly email: string;
}

/** Stable identifiers; the UI translates them (`auth:errors.<CODE>`), it never shows provider text. */
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'WEAK_PASSWORD'
  | 'SAME_PASSWORD'
  | 'RATE_LIMITED'
  | 'SESSION_MISSING'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export type AuthResult =
  { readonly ok: true } | { readonly ok: false; readonly code: AuthErrorCode };

/**
 * Port over the identity provider (ADR 0003: Supabase Auth is used for the session only; every
 * business call goes to the API). Production uses `createSupabaseAuthGateway`; tests inject a fake.
 */
export interface AuthGateway {
  getSession(): Promise<AuthSession | null>;
  /** Current access token, refreshed by the provider when it is about to expire. */
  getAccessToken(): Promise<string | null>;
  /** Calls the listener on sign in, sign out and token refresh. Returns the unsubscribe function. */
  onSessionChange(listener: (session: AuthSession | null) => void): () => void;
  signInWithPassword(input: {
    readonly email: string;
    readonly password: string;
  }): Promise<AuthResult>;
  signOut(): Promise<void>;
  requestPasswordReset(input: {
    readonly email: string;
    readonly redirectTo: string;
  }): Promise<AuthResult>;
  /** Sets the password of the current session (recovery and invitation links create one). */
  updatePassword(password: string): Promise<AuthResult>;
}
