import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

/** Source of the public keys that verify Supabase access tokens (ADR 0016: replaceable in tests). */
export interface JwksProvider {
  readonly getKey: JWTVerifyGetKey;
}

export const JWKS_PROVIDER = Symbol('JWKS_PROVIDER');

const CACHE_MAX_AGE_MS = 10 * 60_000;
const COOLDOWN_MS = 30_000;
const TIMEOUT_MS = 5_000;

/**
 * Keys come from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `jose` caches them and fetches
 * again when a token names an unknown `kid` (key rotation), at most once per cooldown.
 */
export function createRemoteJwksProvider(supabaseUrl: string): JwksProvider {
  const url = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
  return {
    getKey: createRemoteJWKSet(url, {
      cacheMaxAge: CACHE_MAX_AGE_MS,
      cooldownDuration: COOLDOWN_MS,
      timeoutDuration: TIMEOUT_MS,
    }),
  };
}
