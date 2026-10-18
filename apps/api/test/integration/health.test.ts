import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, testEnv, TEST_WEB_ORIGIN } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

describe('GET /api/v1/health', () => {
  let testDb: TestDb;
  let app: INestApplication;
  const logLines: string[] = [];

  beforeAll(async () => {
    testDb = await createTestDb();
    const logStream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        logLines.push(chunk.toString());
        done();
      },
    });
    app = await createTestApp({
      database: testDb.db,
      env: testEnv({ LOG_LEVEL: 'info' }),
      logStream,
    });
  });

  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  it('returns ok with a request id, HSTS and no x-powered-by', async () => {
    // AC-2, AC-4
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toEqual({ status: 'ok', version: 'test' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('echoes a caller supplied request id', async () => {
    // AC-2
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'trace-42')
      .expect(200);
    expect(response.headers['x-request-id']).toBe('trace-42');
  });

  it('does not grant CORS to an origin other than WEB_ORIGIN', async () => {
    // AC-3
    const response = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');

    // Without Access-Control-Allow-Origin the browser rejects the preflight, whatever else is sent.
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('grants CORS to WEB_ORIGIN with the documented methods and headers', async () => {
    // AC-3 (positive control)
    const response = await request(app.getHttpServer())
      .options('/api/v1/health')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-tenant-id');

    expect(response.headers['access-control-allow-origin']).toBe(TEST_WEB_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toBe('GET,POST,PUT,PATCH,DELETE');
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type,X-Tenant-Id',
    );
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('logs the request with the Authorization header redacted', async () => {
    // AC-5
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Authorization', 'Bearer super-secret-token')
      .expect(200);

    const text = logLines.join('');
    expect(text).not.toContain('super-secret-token');
    const completed = logLines
      .map((line) => JSON.parse(line) as { req?: { headers?: Record<string, string> } })
      .filter((line) => line.req?.headers?.['authorization'] !== undefined);
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every((line) => line.req?.headers?.['authorization'] === '[Redacted]')).toBe(
      true,
    );
  });

  it('rejects bodies larger than 1 MB', async () => {
    const body = { payload: 'x'.repeat(1_100_000) };
    await request(app.getHttpServer()).post('/api/v1/health').send(body).expect(413);
  });

  it('serves the OpenAPI document outside production', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body).toMatchObject({
      openapi: expect.any(String),
      info: { title: 'Mini-Market API' },
    });
  });
});
