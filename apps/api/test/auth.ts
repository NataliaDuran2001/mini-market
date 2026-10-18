import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';
import type { JwksProvider } from '../src/modules/access/infrastructure/auth/jwks';

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export const TEST_ISSUER = 'http://localhost:54321/auth/v1';
const TEST_KID = 'test-key';

export interface TokenOptions {
  readonly sub?: string;
  readonly email?: string | undefined;
  readonly issuer?: string;
  readonly audience?: string;
  /** Seconds since epoch; defaults to one hour from now. */
  readonly expiresAt?: number;
  /** Sign with another key pair that carries the same `kid`. */
  readonly signWith?: SigningKey;
}

export interface TestAuth {
  readonly jwks: JwksProvider;
  /** A key pair the JWKS does not know, for "signed by another key" cases. */
  readonly foreignKey: SigningKey;
  signToken(options?: TokenOptions): Promise<string>;
}

/**
 * Local test key pair plus an in-memory JWKS (ADR 0016), so the guard is tested without Supabase.
 * Tokens are ES256, like Supabase asymmetric signing keys.
 */
export async function createTestAuth(): Promise<TestAuth> {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const foreign = await generateKeyPair('ES256');
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid: TEST_KID,
    alg: 'ES256',
    use: 'sig',
  };
  return {
    jwks: { getKey: createLocalJWKSet({ keys: [publicJwk] }) },
    foreignKey: foreign.privateKey,
    async signToken(options = {}) {
      const claims =
        options.email === undefined && 'email' in options
          ? {}
          : { email: options.email ?? 'ana@example.com' };
      return new SignJWT(claims)
        .setProtectedHeader({ alg: 'ES256', kid: TEST_KID })
        .setSubject(options.sub ?? '3f2504e0-4f89-41d3-9a0c-0305e82c3301')
        .setIssuer(options.issuer ?? TEST_ISSUER)
        .setAudience(options.audience ?? 'authenticated')
        .setIssuedAt()
        .setExpirationTime(options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600)
        .sign(options.signWith ?? privateKey);
    },
  };
}
