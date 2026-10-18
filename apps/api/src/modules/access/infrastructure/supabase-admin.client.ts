import type {
  SupabaseAdminPort,
  SupabaseInviteOutcome,
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

/** Calls the GoTrue admin endpoint `POST /auth/v1/invite` with the service role key. */
export class SupabaseAdminClient implements SupabaseAdminPort {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: SupabaseAdminOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async inviteUserByEmail(request: SupabaseInviteRequest): Promise<SupabaseInviteOutcome> {
    const url = new URL('/auth/v1/invite', this.options.supabaseUrl);
    url.searchParams.set('redirect_to', request.redirectTo);
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        apikey: this.options.serviceRoleKey,
        Authorization: `Bearer ${this.options.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: request.email }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      return 'invited';
    }
    const body = (await response.json().catch(() => ({}))) as { error_code?: unknown }; // GoTrue error body
    if (response.status === 422 && body.error_code === 'email_exists') {
      return 'already_registered';
    }
    // Status and code only: the response body can echo the email and must not reach the logs.
    const code = typeof body.error_code === 'string' ? body.error_code : 'unknown';
    throw new Error(`Supabase invite failed with status ${response.status} (${code})`);
  }
}
