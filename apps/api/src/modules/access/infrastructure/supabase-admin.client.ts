import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
  SupabaseUserDirectory,
  SupabaseUserRef,
} from '../application/ports/supabase-admin.port';

const REQUEST_TIMEOUT_MS = 10_000;
const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 25;

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
export class SupabaseAdminClient implements SupabaseAdminPort, SupabaseUserDirectory {
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

  #headers(): Record<string, string> {
    return {
      apikey: this.#serviceRoleKey,
      ...(looksLikeJwt(this.#serviceRoleKey)
        ? { Authorization: `Bearer ${this.#serviceRoleKey}` }
        : {}),
    };
  }

  async findOrInviteUser(request: SupabaseInviteRequest): Promise<SupabaseUserRef> {
    const url = new URL('/auth/v1/invite', this.#supabaseUrl);
    url.searchParams.set('redirect_to', request.redirectTo);
    const response = await this.#fetchFn(url, {
      method: 'POST',
      headers: { ...this.#headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: request.email }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as { id?: unknown }; // GoTrue user
      if (typeof body.id !== 'string') throw new Error('Supabase invite returned no user id');
      return { userId: body.id, invited: true };
    }
    const body = (await response.json().catch(() => ({}))) as { error_code?: unknown };
    if (response.status === 422 && body.error_code === 'email_exists') {
      return { userId: await this.#findUserId(request.email), invited: false };
    }
    const code = typeof body.error_code === 'string' ? body.error_code : 'unknown';
    throw new Error(`Supabase invite failed with status ${response.status} (${code})`);
  }

  /** Scans the admin user list: GoTrue has no lookup by email. Provisioning runs rarely. */
  async #findUserId(email: string): Promise<string> {
    const wanted = email.toLowerCase();
    for (let page = 1; page <= MAX_USER_PAGES; page++) {
      const url = new URL('/auth/v1/admin/users', this.#supabaseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('per_page', String(USERS_PER_PAGE));
      const response = await this.#fetchFn(url, {
        headers: this.#headers(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Supabase user lookup failed with status ${response.status}`);
      }
      const body = (await response.json()) as { users?: { id?: unknown; email?: unknown }[] };
      const users = body.users ?? [];
      const match = users.find(
        (user) => typeof user.email === 'string' && user.email.toLowerCase() === wanted,
      );
      if (match && typeof match.id === 'string') return match.id;
      if (users.length < USERS_PER_PAGE) break;
    }
    throw new Error('Supabase reports the account exists but it was not found in the user list');
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
