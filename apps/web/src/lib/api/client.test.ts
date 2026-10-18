import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiUrl } from '@/test/msw/api-url';
import { server } from '@/test/msw/server';
import { ApiError } from './api-error';
import { createApiClient } from './client';

const client = createApiClient({ baseUrl: 'http://api.test/' });

describe('api client', () => {
  it('prefixes /api/v1 to the base URL and parses JSON', async () => {
    server.use(http.get(apiUrl('/things'), () => HttpResponse.json({ id: '1' })));
    await expect(client.get('/things')).resolves.toEqual({ id: '1' });
  });

  it('sends a JSON body with the content type header', async () => {
    let received: { body: unknown; contentType: string | null } | undefined;
    server.use(
      http.post(apiUrl('/things'), async ({ request }) => {
        received = {
          body: await request.json(),
          contentType: request.headers.get('content-type'),
        };
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );
    await client.post('/things', { body: { name: 'Leche' } });
    expect(received).toEqual({ body: { name: 'Leche' }, contentType: 'application/json' });
  });

  it('validates the response against the contract schema', async () => {
    server.use(http.get(apiUrl('/things'), () => HttpResponse.json({ id: 1 })));
    await expect(client.get('/things', { schema: z.object({ id: z.string() }) })).rejects.toThrow();
  });

  it('returns undefined for an empty 204 response', async () => {
    server.use(http.delete(apiUrl('/things/1'), () => new HttpResponse(null, { status: 204 })));
    await expect(client.delete('/things/1')).resolves.toBeUndefined();
  });

  it('maps an error body to ApiError with status, code and details', async () => {
    server.use(
      http.get(apiUrl('/things'), () =>
        HttpResponse.json(
          { code: 'forbidden', message: 'Not allowed', details: { permission: 'reports.read' } },
          { status: 403 },
        ),
      ),
    );
    const error = await client.get('/things').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: 'forbidden',
      details: { permission: 'reports.read' },
    });
  });

  it('maps a non-JSON error to an unknown_error ApiError', async () => {
    server.use(http.get(apiUrl('/things'), () => new HttpResponse('Bad gateway', { status: 502 })));
    await expect(client.get('/things')).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
    });
  });

  it('maps a network failure to status 0', async () => {
    server.use(http.get(apiUrl('/things'), () => HttpResponse.error()));
    await expect(client.get('/things')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });
});
