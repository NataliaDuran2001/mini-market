import { apiErrorSchema } from '@mini-market/contracts/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { REGISTER_AUTHENTICATED_USER } from '../../src/modules/access/application/register-authenticated-user';
import { SUPABASE_ADMIN } from '../../src/modules/access/application/tokens';
import { JWKS_PROVIDER } from '../../src/modules/access/infrastructure/auth/jwks';
import { createTestAuth } from '../auth';
import type { TestAuth } from '../auth';
import { bearerFor, createTestApp } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

const TENANT_ID = '00000000-0000-0000-0000-0000000000a1';

describe('access module defaults', () => {
  let testDb: TestDb;
  let auth: TestAuth;
  let app: INestApplication | undefined;
  const sent: unknown[] = [];

  beforeAll(async () => {
    testDb = await createTestDb();
    auth = await createTestAuth();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    sent.length = 0;
  });

  afterAll(async () => {
    await testDb.close();
  });

  const invite = async (target: INestApplication) =>
    request(target.getHttpServer())
      .post('/api/v1/auth/invitations')
      .set('Authorization', await bearerFor(target))
      .set('X-Tenant-Id', TENANT_ID)
      .send({ email: 'x@example.com', role: 'employee' });

  it('fails closed: without the memberships table nobody can invite, not even a valid caller', async () => {
    // issue #9 hands authorization to #11; until then the wired directory knows no members
    app = await createTestApp({
      database: testDb.db,
      auth,
      overrides: [
        {
          token: SUPABASE_ADMIN,
          useValue: { inviteUserByEmail: (r: unknown) => Promise.resolve(void sent.push(r)) },
        },
      ],
    });

    const response = await invite(app);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(sent).toEqual([]);
  });

  it('answers 401 and 403 with bodies that match apiErrorSchema, including the request id', async () => {
    // issue #9: "401 with apiErrorSchema body"
    app = await createTestApp({ database: testDb.db, auth });

    const unauthenticated = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
    const parsed = apiErrorSchema.parse(unauthenticated.body);
    expect(parsed.code).toBe('UNAUTHENTICATED');
    expect(parsed.requestId).toBe(unauthenticated.headers['x-request-id']);

    const forbidden = await invite(app);
    expect(forbidden.status).toBe(403);
    expect(apiErrorSchema.safeParse(forbidden.body).success).toBe(true);
  });

  it('answers 500, not 401, when the user mirror cannot be written', async () => {
    // a database failure is a bug or an outage, not a bad token
    app = await createTestApp({
      database: testDb.db,
      auth,
      overrides: [
        {
          token: REGISTER_AUTHENTICATED_USER,
          useValue: () => Promise.reject(new Error('database is down')),
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', await bearerFor(app))
      .expect(500);

    expect(response.body).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(response.body)).not.toContain('database is down');
  });

  it('answers 503, not 401, when the signing keys cannot be fetched', async () => {
    // an outage of Supabase must not make the web sign every user out
    const unreachable = {
      getKey: () => Promise.reject(new TypeError('fetch failed')),
    };
    app = await createTestApp({
      database: testDb.db,
      auth,
      overrides: [{ token: JWKS_PROVIDER, useValue: unreachable }],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', await bearerFor(app))
      .expect(503);

    expect(response.body).toMatchObject({ code: 'IDENTITY_PROVIDER_UNAVAILABLE' });
  });
});
