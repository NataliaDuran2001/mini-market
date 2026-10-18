import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiUrl } from '@/test/msw/api-url';
import { server } from '@/test/msw/server';
import { ApiError } from './api-error';
import { createApiClient } from './client';

const thing = z.object({ id: z.string() });
const getHeaders = vi.fn(({ withTenant }: { withTenant: boolean }) =>
  Promise.resolve({
    Authorization: 'Bearer token-1',
    ...(withTenant ? { 'X-Tenant-Id': 'tenant-1' } : {}),
  }),
);

describe('api client authentication', () => {
  it('attaches Authorization and X-Tenant-Id to every request', async () => {
    // AC-1 (#14)
    let seen: Headers | undefined;
    server.use(
      http.get(apiUrl('/things'), ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ id: '1' });
      }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', getHeaders });
    await client.get('/things', { schema: thing });
    expect(seen?.get('authorization')).toBe('Bearer token-1');
    expect(seen?.get('x-tenant-id')).toBe('tenant-1');
  });

  it('omits X-Tenant-Id for routes called without a tenant', async () => {
    // AC-5 (#14)
    let seen: Headers | undefined;
    server.use(
      http.get(apiUrl('/me/tenants'), ({ request }) => {
        seen = request.headers;
        return HttpResponse.json({ id: '1' });
      }),
    );
    const client = createApiClient({ baseUrl: 'http://api.test', getHeaders });
    await client.get('/me/tenants', { schema: thing, withTenant: false });
    expect(seen?.get('authorization')).toBe('Bearer token-1');
    expect(seen?.has('x-tenant-id')).toBe(false);
  });

  it('calls onUnauthorized once on a 401 and still throws the ApiError', async () => {
    // AC-3 (#14)
    server.use(
      http.get(apiUrl('/things'), () =>
        HttpResponse.json({ code: 'UNAUTHENTICATED', message: 'x' }, { status: 401 }),
      ),
    );
    const onUnauthorized = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', onUnauthorized });
    await expect(client.get('/things', { schema: thing })).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  });

  it('calls onForbidden on a 403 and not onUnauthorized', async () => {
    server.use(
      http.get(apiUrl('/things'), () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'x' }, { status: 403 }),
      ),
    );
    const onUnauthorized = vi.fn();
    const onForbidden = vi.fn();
    const client = createApiClient({ baseUrl: 'http://api.test', onUnauthorized, onForbidden });
    await expect(client.get('/things', { schema: thing })).rejects.toMatchObject({ status: 403 });
    expect(onForbidden).toHaveBeenCalledOnce();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
