import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { SupabaseAdminClient } from './supabase-admin.client';

interface Call {
  url: string;
  init: RequestInit;
}

function clientReplying(
  status: number,
  body: unknown,
  calls: Call[] = [],
  serviceRoleKey = 'header.payload.signature',
): SupabaseAdminClient {
  const fetchFn: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return new SupabaseAdminClient({
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey,
    fetchFn,
  });
}

const request = { email: 'ana@example.com', redirectTo: 'https://app.example/accept?token=abc' };

describe('SupabaseAdminClient.inviteUserByEmail', () => {
  it('posts the email to the invite endpoint with the service role key and the redirect', async () => {
    // AC-4
    const calls: Call[] = [];
    await expect(
      clientReplying(200, { id: 'u1' }, calls).inviteUserByEmail(request),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://project.supabase.co/auth/v1/invite');
    expect(url.searchParams.get('redirect_to')).toBe(request.redirectTo);
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      apikey: 'header.payload.signature',
      Authorization: 'Bearer header.payload.signature',
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ email: 'ana@example.com' });
  });

  it('sends the new sb_secret key in apikey only, since it is not a JWT', async () => {
    const calls: Call[] = [];
    await clientReplying(200, {}, calls, 'sb_secret_abc123').inviteUserByEmail(request);

    expect(calls[0]?.init.headers).toMatchObject({ apikey: 'sb_secret_abc123' });
    expect(calls[0]?.init.headers).not.toHaveProperty('Authorization');
  });

  it('treats an email that already has an account as done, so the answer reveals nothing', async () => {
    // an owner must not learn whether an address is registered on the platform
    await expect(
      clientReplying(422, { error_code: 'email_exists' }).inviteUserByEmail(request),
    ).resolves.toBeUndefined();
  });

  it('never exposes the key when the client is logged or serialized', () => {
    const client = clientReplying(200, {}, [], 'header.payload.signature');
    expect(JSON.stringify(client)).not.toContain('header.payload.signature');
    expect(inspect(client, { showHidden: true, depth: 4 })).not.toContain(
      'header.payload.signature',
    );
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
