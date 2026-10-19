// Supabase Auth admin calls the local scripts need beyond `SupabaseAdminClient` (issue #97): create
// a confirmed test user with a password, and delete one. Service role key, server side only. Errors
// carry the status and GoTrue error code, never the response body (it can echo an email).
const TIMEOUT_MS = 10_000;
const PER_PAGE = 200;
const MAX_PAGES = 25;

export interface AuthAdminOptions {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly fetchFn?: typeof fetch;
}

// Legacy service role keys are JWTs and go in both headers; `sb_secret_...` keys only in `apikey`.
const looksLikeJwt = (key: string): boolean => key.split('.').length === 3;

export class AuthAdmin {
  readonly #key: string;
  readonly #url: string;
  readonly #fetch: typeof fetch;

  constructor(options: AuthAdminOptions) {
    this.#key = options.serviceRoleKey;
    this.#url = options.supabaseUrl;
    this.#fetch = options.fetchFn ?? fetch;
  }

  async #call(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
    return this.#fetch(new URL(pathAndQuery, this.#url), {
      method,
      headers: {
        apikey: this.#key,
        ...(looksLikeJwt(this.#key) ? { Authorization: `Bearer ${this.#key}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  /** `knownCode` is passed when the caller already consumed the response body. */
  async #fail(action: string, response: Response, knownCode?: unknown): Promise<never> {
    const body =
      knownCode === undefined
        ? ((await response.json().catch(() => ({}))) as { error_code?: unknown })
        : { error_code: knownCode };
    const code = typeof body.error_code === 'string' ? body.error_code : 'unknown';
    throw new Error(`${action} failed with status ${response.status} (${code})`);
  }

  /** @returns the user id, or undefined when no account has that email */
  async findUserId(email: string): Promise<string | undefined> {
    const wanted = email.toLowerCase();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.#call(
        'GET',
        `/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
      );
      if (!response.ok) return this.#fail('Supabase user lookup', response);
      const { users = [] } = (await response.json()) as {
        users?: { id?: unknown; email?: unknown }[];
      };
      const match = users.find(
        (user) => typeof user.email === 'string' && user.email.toLowerCase() === wanted,
      );
      if (match && typeof match.id === 'string') return match.id;
      if (users.length < PER_PAGE) return undefined;
    }
    throw new Error(`Supabase user lookup gave up after ${MAX_PAGES} pages`);
  }

  /**
   * Creates a confirmed user with a password, or resets the password of the existing one.
   * @returns whether the account was created (false: it existed and its password was set again)
   */
  async ensureUserWithPassword(email: string, password: string): Promise<{ created: boolean }> {
    const created = await this.#call('POST', '/auth/v1/admin/users', {
      email,
      password,
      email_confirm: true,
    });
    if (created.ok) {
      await created.body?.cancel();
      return { created: true };
    }
    const body = (await created.json().catch(() => ({}))) as { error_code?: unknown };
    if (created.status !== 422 || body.error_code !== 'email_exists') {
      return this.#fail('Supabase user creation', created, body.error_code ?? null);
    }
    const id = await this.findUserId(email);
    if (!id) throw new Error('Supabase reports the account exists but it was not found');
    const updated = await this.#call('PUT', `/auth/v1/admin/users/${id}`, {
      password,
      email_confirm: true,
    });
    if (!updated.ok) return this.#fail('Supabase password reset', updated);
    await updated.body?.cancel();
    return { created: false };
  }

  /** @returns whether an account was deleted */
  async deleteUserByEmail(email: string): Promise<boolean> {
    const id = await this.findUserId(email);
    if (!id) return false;
    const response = await this.#call('DELETE', `/auth/v1/admin/users/${id}`);
    if (!response.ok) return this.#fail('Supabase user deletion', response);
    await response.body?.cancel();
    return true;
  }
}
