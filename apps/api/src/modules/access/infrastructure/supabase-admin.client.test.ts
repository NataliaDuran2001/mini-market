import { describe, expect, it } from 'vitest';
import { SupabaseAdminClient } from './supabase-admin.client';

interface Call {
  url: string;
  init: RequestInit;
}

function clientReplying(status: number, body: unknown, calls: Call[] = []): SupabaseAdminClient {
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return new SupabaseAdminClient({
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-secret',
    fetchFn,
  });
}

const request = { email: 'ana@example.com', redirectTo: 'https://app.example/accept?token=abc' };

describe('SupabaseAdminClient.inviteUserByEmail', () => {
  it('posts the email to the invite endpoint with the service role key and the redirect', async () => {
    // AC-4
    const calls: Call[] = [];
    const outcome = await clientReplying(200, { id: 'u1' }, calls).inviteUserByEmail(request);

    expect(outcome).toBe('invited');
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://project.supabase.co/auth/v1/invite');
    expect(url.searchParams.get('redirect_to')).toBe(request.redirectTo);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      apikey: 'service-role-secret',
      Authorization: 'Bearer service-role-secret',
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'ana@example.com' });
  });

  it('reports an email that already has an account instead of failing', async () => {
    const outcome = await clientReplying(422, { error_code: 'email_exists' }).inviteUserByEmail(
      request,
    );
    expect(outcome).toBe('already_registered');
  });

  it('throws with the status and code only, never the response body', async () => {
    const failing = clientReplying(500, {
      error_code: 'unexpected_failure',
      msg: 'ana@example.com is bad',
    });
    const error = await failing.inviteUserByEmail(request).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Supabase invite failed with status 500 (unexpected_failure)',
    );
  });

  it('survives a response that is not JSON', async () => {
    const fetchFn: typeof fetch = () =>
      Promise.resolve(new Response('gateway error', { status: 502 }));
    const client = new SupabaseAdminClient({
      supabaseUrl: 'https://project.supabase.co',
      serviceRoleKey: 'k',
      fetchFn,
    });
    await expect(client.inviteUserByEmail(request)).rejects.toThrow('status 502 (unknown)');
  });
});
