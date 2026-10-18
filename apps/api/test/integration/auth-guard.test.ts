import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { useAccessApp } from '../access-fixture';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

type LogLine = { level: number; reason?: string };

describe('JWT guard and GET /api/v1/me', () => {
  const ctx = useAccessApp();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const warnings = () =>
    ctx.logLines.map((line) => JSON.parse(line) as LogLine).filter((line) => line.level === 40);

  it('answers 401 UNAUTHENTICATED when there is no Authorization header', async () => {
    // AC-1
    const response = await request(server()).get('/api/v1/me').expect(401);
    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('answers 401 for a header that is not a bearer token, without warning about it', async () => {
    // AC-1
    await request(server()).get('/api/v1/me').set('Authorization', 'Basic abc').expect(401);
    await request(server()).get('/api/v1/me').set('Authorization', 'Bearer').expect(401);
    expect(warnings()).toEqual([]); // a missing token is routine: info, not warn
  });

  it('rejects a token signed by another key and logs a warning without the token', async () => {
    // AC-2
    const token = await ctx.auth().signToken({ signWith: ctx.auth().foreignKey });
    const response = await request(server())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(ctx.logLines.join('')).not.toContain(token);
    expect(warnings().map((line) => line.reason)).toContain(
      'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    );
  });

  it('rejects an expired token', async () => {
    // AC-2
    const token = await ctx.auth().signToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);

    expect(warnings().map((line) => line.reason)).toContain('ERR_JWT_EXPIRED');
    expect(ctx.logLines.join('')).not.toContain(token);
  });

  it('rejects a wrong issuer or audience, a missing email, a tampered payload and alg none', async () => {
    // AC-2 (ADR 0015: verify issuer and audience)
    const auth = ctx.auth();
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
      await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(401);
    }
  });

  it('lets @Public() routes through without a token', async () => {
    await request(server()).get('/api/v1/health').expect(200);
  });

  it('returns the caller and mirrors the user into the users table', async () => {
    // AC-3
    const response = await request(server())
      .get('/api/v1/me')
      .set('Authorization', await ctx.bearer())
      .expect(200);

    expect(response.body).toEqual({ userId: OWNER_ID, email: 'ana@example.com' });
    const { rows } = await ctx
      .testDb()
      .client.query<{ id: string; email: string }>('select id, email from users');
    expect(rows).toEqual([{ id: OWNER_ID, email: 'ana@example.com' }]);
  });

  it('keeps one row per user and refreshes a changed email', async () => {
    // AC-3
    for (const claims of [{}, {}, { email: 'ana.new@example.com' }]) {
      await request(server())
        .get('/api/v1/me')
        .set('Authorization', await ctx.bearer(claims))
        .expect(200);
    }

    const { rows } = await ctx.testDb().client.query<{ email: string }>('select email from users');
    expect(rows).toEqual([{ email: 'ana.new@example.com' }]);
  });
});
