import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
} from '../application/ports/supabase-admin.port';

const REQUEST_TIMEOUT_MS = 10_000;

export interface SupabaseAdminOptions {
  readonly supabaseUrl: string;
  /** Service role key. Server side only. */
  readonly serviceRoleKey: string;
  /** Replaced in tests; defaults to the global `fetch`. */
  readonly fetchFn?: typeof fetch;
}

// Legacy service role keys are JWTs and go in both headers; `sb_secret_...` keys are not JWTs and
// are accepted in `apikey` only.
const looksLikeJwt = (key: string): boolean => key.split('.').length === 3;

/** Calls the GoTrue admin endpoint `POST /auth/v1/invite` with the service role key. */
export class SupabaseAdminClient implements SupabaseAdminPort {
  // A private field is invisible to `JSON.stringify` and `util.inspect`, so logging this object
  // can never print the key.
  readonly #serviceRoleKey: string;
  readonly #supabaseUrl: string;
  readonly #fetchFn: typeof fetch;

  constructor(options: SupabaseAdminOptions) {
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#supabaseUrl = options.supabaseUrl;
    this.#fetchFn = options.fetchFn ?? fetch;
  }

  async inviteUserByEmail(request: SupabaseInviteRequest): Promise<void> {
    const url = new URL('/auth/v1/invite', this.#supabaseUrl);
    url.searchParams.set('redirect_to', request.redirectTo);
    const response = await this.#fetchFn(url, {
      method: 'POST',
      headers: {
        apikey: this.#serviceRoleKey,
        ...(looksLikeJwt(this.#serviceRoleKey)
          ? { Authorization: `Bearer ${this.#serviceRoleKey}` }
          : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: request.email }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    const body = (await response.json().catch(() => ({}))) as { error_code?: unknown }; // GoTrue error body
    if (response.status === 422 && body.error_code === 'email_exists') {
      // The person already has an account. Not an error, and not reported to the caller: an owner
      // must not learn whether an address is registered. They sign in and use the invitation.
      return;
    }
    // Status and code only: the response body can echo the email and must not reach the logs.
    const code = typeof body.error_code === 'string' ? body.error_code : 'unknown';
    throw new Error(`Supabase invite failed with status ${response.status} (${code})`);
  }
}
