import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

/** Source of the public keys that verify Supabase access tokens (ADR 0016: replaceable in tests). */
export interface JwksProvider {
  readonly getKey: JWTVerifyGetKey;
}

export const JWKS_PROVIDER = Symbol('JWKS_PROVIDER');

export interface RemoteJwksOptions {
  /** How long fetched keys are used before they are fetched again. */
  readonly cacheMaxAgeMs?: number;
  /** Minimum time between two fetches triggered by an unknown `kid`. */
  readonly cooldownMs?: number;
  readonly timeoutMs?: number;
}

const CACHE_MAX_AGE_MS = 10 * 60_000;
const COOLDOWN_MS = 30_000;
const TIMEOUT_MS = 5_000;

/**
 * Keys come from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. `jose` caches them and fetches
 * again when a token names an unknown `kid` (key rotation), at most once per cooldown.
 */
export function createRemoteJwksProvider(
  supabaseUrl: string,
  options: RemoteJwksOptions = {},
): JwksProvider {
  const url = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
  return {
    getKey: createRemoteJWKSet(url, {
      cacheMaxAge: options.cacheMaxAgeMs ?? CACHE_MAX_AGE_MS,
      cooldownDuration: options.cooldownMs ?? COOLDOWN_MS,
      timeoutDuration: options.timeoutMs ?? TIMEOUT_MS,
    }),
  };
}
