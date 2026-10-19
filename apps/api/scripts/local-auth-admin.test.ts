import { describe, expect, it } from 'vitest';
import { AuthAdmin } from './local-auth-admin';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function admin(handler: (request: Request) => Response) {
  const calls: { method: string; path: string }[] = [];
  const fetchFn = ((input: URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ method: request.method, path: new URL(request.url).pathname });
    return Promise.resolve(handler(request));
  }) as typeof fetch;
  return {
    calls,
    client: new AuthAdmin({
      supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      serviceRoleKey: 'sentinel-service-key',
      fetchFn,
    }),
  };
}

describe('AuthAdmin', () => {
  it('creates a confirmed user', async () => {
    const { client, calls } = admin(() => json(200, { id: 'u1' }));
    expect(await client.ensureUserWithPassword('a@example.com', 'pw')).toEqual({ created: true });
    expect(calls).toEqual([{ method: 'POST', path: '/auth/v1/admin/users' }]);
  });

  it('sets the password again when the account exists', async () => {
    const { client, calls } = admin((request) => {
      const { pathname } = new URL(request.url);
      if (request.method === 'POST') return json(422, { error_code: 'email_exists' });
      if (request.method === 'GET')
        return json(200, { users: [{ id: 'u1', email: 'A@example.com' }] });
      return pathname.endsWith('/u1') ? json(200, {}) : json(404, {});
    });
    expect(await client.ensureUserWithPassword('a@example.com', 'pw')).toEqual({ created: false });
    expect(calls.map((call) => call.method)).toEqual(['POST', 'GET', 'PUT']);
  });

  it('reports status and code only, never the response body', async () => {
    const { client } = admin(() =>
      json(500, { error_code: 'unexpected_failure', msg: 'leaks a@example.com' }),
    );
    const error = await client.ensureUserWithPassword('a@example.com', 'pw').catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Supabase user creation failed with status 500 (unexpected_failure)',
    );
    expect((error as Error).message).not.toContain('a@example.com');
  });

  it('deletes by email and answers false for an unknown account', async () => {
    const known = admin((request) =>
      request.method === 'GET'
        ? json(200, { users: [{ id: 'u1', email: 'a@example.com' }] })
        : json(200, {}),
    );
    expect(await known.client.deleteUserByEmail('a@example.com')).toBe(true);
    const unknown = admin(() => json(200, { users: [] }));
    expect(await unknown.client.deleteUserByEmail('a@example.com')).toBe(false);
  });
});
