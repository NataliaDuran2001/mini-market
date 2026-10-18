import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MEMBERSHIP_DIRECTORY, SUPABASE_ADMIN } from '../../src/modules/access/application/tokens';
import type { MembershipDirectory } from '../../src/modules/access/application/ports/membership-directory.port';
import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
} from '../../src/modules/access/application/ports/supabase-admin.port';
import type { Role } from '../../src/modules/access/domain/identity';
import { JWKS_PROVIDER } from '../../src/modules/access/infrastructure/auth/jwks';
import { createTestAuth, TEST_ISSUER } from '../auth';
import type { TestAuth } from '../auth';
import { createTestApp, testEnv } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const TENANT_ID = '00000000-0000-0000-0000-0000000000a1';

class FakeSupabaseAdmin implements SupabaseAdminPort {
  readonly invites: SupabaseInviteRequest[] = [];
  outcome: 'invited' | 'already_registered' = 'invited';

  inviteUserByEmail(request: SupabaseInviteRequest): Promise<'invited' | 'already_registered'> {
    this.invites.push(request);
    return Promise.resolve(this.outcome);
  }
}

describe('authentication and invitations over HTTP', () => {
  let testDb: TestDb;
  let app: INestApplication;
  let auth: TestAuth;
  const admin = new FakeSupabaseAdmin();
  const roles = new Map<string, Role>();
  const logLines: string[] = [];
  const memberships: MembershipDirectory = {
    roleOf: (_tx, tenantId, userId) => Promise.resolve(roles.get(`${tenantId}:${userId}`) ?? null),
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    auth = await createTestAuth();
  });

  afterAll(async () => {
    await testDb.close();
  });

  // A fresh app per test: the guard remembers which users it already mirrored, and truncateAll
  // removes the rows between tests.
  beforeEach(async () => {
    await testDb.truncateAll();
    roles.clear();
    admin.invites.length = 0;
    admin.outcome = 'invited';
    logLines.length = 0;
    app = await createTestApp({
      database: testDb.db,
      env: testEnv({ LOG_LEVEL: 'info', SUPABASE_JWT_ISSUER: TEST_ISSUER }),
      logStream: new Writable({
        write(chunk: Buffer, _encoding, done) {
          logLines.push(chunk.toString());
          done();
        },
      }),
      overrides: [
        { token: JWKS_PROVIDER, useValue: auth.jwks },
        { token: SUPABASE_ADMIN, useValue: admin },
        { token: MEMBERSHIP_DIRECTORY, useValue: memberships },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const bearer = async (options?: Parameters<TestAuth['signToken']>[0]) =>
    `Bearer ${await auth.signToken(options)}`;

  describe('JWT guard', () => {
    it('answers 401 UNAUTHENTICATED when there is no Authorization header', async () => {
      // AC-1
      const response = await request(app.getHttpServer()).get('/api/v1/me').expect(401);
      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('answers 401 for a header that is not a bearer token', async () => {
      // AC-1
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Basic abc')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', 'Bearer')
        .expect(401);
    });

    it('rejects a token signed by another key and logs a warning without the token', async () => {
      // AC-2
      const token = await auth.signToken({ signWith: auth.foreignKey });
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
      const text = logLines.join('');
      expect(text).not.toContain(token);
      const warning = logLines
        .map((line) => JSON.parse(line) as { level: number; reason?: string })
        .find((line) => line.level === 40 && line.reason !== undefined);
      expect(warning?.reason).toBe('ERR_JWS_SIGNATURE_VERIFICATION_FAILED');
    });

    it('rejects an expired token', async () => {
      // AC-2
      const token = await auth.signToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      const warning = logLines
        .map((line) => JSON.parse(line) as { level: number; reason?: string })
        .find((line) => line.level === 40);
      expect(warning?.reason).toBe('ERR_JWT_EXPIRED');
      expect(logLines.join('')).not.toContain(token);
    });

    it('rejects a token with the wrong issuer, audience or without an email, and a tampered one', async () => {
      // AC-2 (ADR 0015: verify issuer and audience)
      const tokens = [
        await auth.signToken({ issuer: 'https://evil.example/auth/v1' }),
        await auth.signToken({ audience: 'anon' }),
        await auth.signToken({ email: undefined }),
      ];
      const [header, payload, signature] = (await auth.signToken()).split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()),
          sub: 'someone-else',
        }),
      ).toString('base64url');
      tokens.push(`${header ?? ''}.${forgedPayload}.${signature ?? ''}`);
      tokens.push(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload ?? ''}.`);

      for (const token of tokens) {
        await request(app.getHttpServer())
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });

    it('lets @Public() routes through without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    });
  });

  describe('GET /api/v1/me', () => {
    it('returns the caller and mirrors the user into the users table', async () => {
      // AC-3
      const response = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', await bearer())
        .expect(200);

      expect(response.body).toEqual({ userId: OWNER_ID, email: 'ana@example.com' });
      const { rows } = await testDb.client.query<{ id: string; email: string }>(
        'select id, email from users',
      );
      expect(rows).toEqual([{ id: OWNER_ID, email: 'ana@example.com' }]);
    });

    it('keeps one row per user and refreshes a changed email', async () => {
      // AC-3
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', await bearer())
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', await bearer())
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', await bearer({ email: 'ana.new@example.com' }))
        .expect(200);

      const { rows } = await testDb.client.query<{ email: string }>('select email from users');
      expect(rows).toEqual([{ email: 'ana.new@example.com' }]);
    });
  });

  describe('POST /api/v1/auth/invitations', () => {
    const invite = async (
      user: { sub: string },
      body: unknown,
      tenant: string | undefined = TENANT_ID,
    ) => {
      const req = request(app.getHttpServer())
        .post('/api/v1/auth/invitations')
        .set('Authorization', await bearer({ sub: user.sub }));
      return (tenant ? req.set('X-Tenant-Id', tenant) : req).send(body as object);
    };

    it('lets the owner invite an employee: 202, invite sent, pending row stored', async () => {
      // AC-4
      roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');

      const response = await invite(
        { sub: OWNER_ID },
        { email: ' New.Employee@Example.com ', role: 'employee' },
      ).then((res) => res);

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        email: 'new.employee@example.com',
        role: 'employee',
        delivery: 'invited',
      });
      expect(admin.invites).toHaveLength(1);
      expect(admin.invites[0]?.email).toBe('new.employee@example.com');
      expect(admin.invites[0]?.redirectTo).toMatch(
        /^http:\/\/localhost:5173\/accept-invitation\?token=[\w-]{43}$/,
      );
      const { rows } = await testDb.client.query<{
        tenant_id: string;
        email: string;
        role: string;
        invited_by: string;
        token_hash: string;
        consumed_at: string | null;
      }>('select tenant_id, email, role, invited_by, token_hash, consumed_at from invitations');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: TENANT_ID,
        email: 'new.employee@example.com',
        role: 'employee',
        invited_by: OWNER_ID,
        consumed_at: null,
      });
      const rawToken = new URL(admin.invites[0]?.redirectTo ?? '').searchParams.get('token');
      expect(rows[0]?.token_hash).not.toBe(rawToken); // only the hash is stored
      expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('answers 403 FORBIDDEN to an employee and sends nothing', async () => {
      // AC-5
      roles.set(`${TENANT_ID}:${EMPLOYEE_ID}`, 'employee');

      const response = await invite(
        { sub: EMPLOYEE_ID },
        { email: 'x@example.com', role: 'employee' },
      );

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'FORBIDDEN',
        details: { permission: 'members.manage' },
      });
      expect(admin.invites).toEqual([]);
      const { rows } = await testDb.client.query('select 1 from invitations');
      expect(rows).toEqual([]);
    });

    it('answers 403 NOT_A_MEMBER to a user outside the tenant', async () => {
      const response = await invite(
        { sub: OWNER_ID },
        { email: 'x@example.com', role: 'employee' },
      );
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'NOT_A_MEMBER' });
    });

    it('answers 400 VALIDATION_ERROR for a bad body or a missing tenant header', async () => {
      roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');

      const badEmail = await invite({ sub: OWNER_ID }, { email: 'nope', role: 'employee' });
      expect(badEmail.status).toBe(400);
      expect(badEmail.body).toMatchObject({ code: 'VALIDATION_ERROR' });
      const badRole = await invite({ sub: OWNER_ID }, { email: 'x@example.com', role: 'owner' });
      expect(badRole.status).toBe(400);
      const noTenant = await invite(
        { sub: OWNER_ID },
        { email: 'x@example.com', role: 'employee' },
        '',
      );
      expect(noTenant.status).toBe(400);
      expect(noTenant.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('requires authentication', async () => {
      // AC-1
      await request(app.getHttpServer())
        .post('/api/v1/auth/invitations')
        .set('X-Tenant-Id', TENANT_ID)
        .send({ email: 'x@example.com', role: 'employee' })
        .expect(401);
    });

    it('still stores the invitation when the email already has an account', async () => {
      roles.set(`${TENANT_ID}:${OWNER_ID}`, 'owner');
      admin.outcome = 'already_registered';

      const response = await invite(
        { sub: OWNER_ID },
        { email: 'known@example.com', role: 'employee' },
      );

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({ delivery: 'existing_user' });
    });
  });
});
