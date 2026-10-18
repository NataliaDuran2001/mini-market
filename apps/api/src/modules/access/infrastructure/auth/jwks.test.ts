import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { createRemoteJwksProvider } from './jwks';
import { verifyAccessToken } from './verify-access-token';

const ISSUER = 'https://project.supabase.co/auth/v1';

async function signingKey(kid: string, alg: 'ES256' | 'RS256') {
  const { publicKey, privateKey } = await generateKeyPair(alg);
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' };
  const sign = () =>
    new SignJWT({ email: 'ana@example.com' })
      .setProtectedHeader({ alg, kid })
      .setSubject('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(privateKey);
  return { jwk, sign };
}

describe('remote JWKS', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  /** Serves `keys` at the Supabase JWKS path; counts requests per path. */
  async function serve(keys: () => JWK[]): Promise<{ url: string; hits: string[] }> {
    const hits: string[] = [];
    const listening = createServer((req, res) => {
      hits.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: keys() }));
    });
    server = listening;
    await new Promise<void>((resolve) => listening.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${(listening.address() as AddressInfo).port}`, hits };
  }

  it('fetches the keys from the Supabase JWKS path once and reuses them', async () => {
    // AC-3 ("caches keys")
    const key = await signingKey('k1', 'ES256');
    const { url, hits } = await serve(() => [key.jwk]);
    const jwks = createRemoteJwksProvider(url);

    for (let attempt = 0; attempt < 3; attempt++) {
      const user = await verifyAccessToken(await key.sign(), { jwks, issuer: ISSUER });
      expect(user.email).toBe('ana@example.com');
    }

    expect(hits).toEqual(['/auth/v1/.well-known/jwks.json']);
  });

  it('fetches again when a token names a key that rotated in', async () => {
    // docs/05-security.md: keys cached and rotated
    const first = await signingKey('k1', 'ES256');
    const second = await signingKey('k2', 'ES256');
    let published = [first.jwk];
    const { url, hits } = await serve(() => published);
    const jwks = createRemoteJwksProvider(url, { cooldownMs: 0 });

    await verifyAccessToken(await first.sign(), { jwks, issuer: ISSUER });
    published = [first.jwk, second.jwk];
    await verifyAccessToken(await second.sign(), { jwks, issuer: ISSUER });

    expect(hits).toHaveLength(2);
  });

  it('accepts RS256 as well as ES256', async () => {
    // issue #9: "verifies RS256/ES256"
    const rsa = await signingKey('rsa-1', 'RS256');
    const { url } = await serve(() => [rsa.jwk]);

    const user = await verifyAccessToken(await rsa.sign(), {
      jwks: createRemoteJwksProvider(url),
      issuer: ISSUER,
    });

    expect(user.userId).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  });

  it('rejects a token signed with an HMAC secret even when the JWKS holds an RSA key', async () => {
    // key confusion: algorithms are pinned to RS256 and ES256
    const rsa = await signingKey('rsa-1', 'RS256');
    const { url } = await serve(() => [rsa.jwk]);
    const forged = await new SignJWT({ email: 'evil@example.com' })
      .setProtectedHeader({ alg: 'HS256', kid: 'rsa-1' })
      .setSubject('3f2504e0-4f89-41d3-9a0c-0305e82c3301')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('any shared secret value with enough length 123456'));

    await expect(
      verifyAccessToken(forged, { jwks: createRemoteJwksProvider(url), issuer: ISSUER }),
    ).rejects.toMatchObject({ name: 'TokenRejectedError' });
  });
});
