import { jwtVerify } from 'jose';
import type { AuthenticatedUser } from '../../domain/identity';
import type { JwksProvider } from './jwks';

/** The token cannot be trusted. `reason` is safe to log; it never contains the token. */
export class TokenRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`Access token rejected: ${reason}`);
    this.name = 'TokenRejectedError';
  }
}

/** The keys could not be fetched (Supabase down, timeout): the token was not judged at all. */
export class IdentityProviderUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`Identity provider unavailable: ${reason}`);
    this.name = 'IdentityProviderUnavailableError';
  }
}

export interface VerifyOptions {
  readonly jwks: JwksProvider;
  /** Value of `SUPABASE_JWT_ISSUER`. */
  readonly issuer: string;
}

const AUDIENCE = 'authenticated';
const ALGORITHMS = ['RS256', 'ES256'];

// jose error codes that describe a defect of the token itself. Anything else (fetch failure,
// timeout, malformed JWKS document) is an outage and must not look like a bad token.
const TOKEN_DEFECT =
  /^(ERR_JWT_|ERR_JWS_|ERR_JWKS_NO_MATCHING_KEY|ERR_JWKS_MULTIPLE_MATCHING_KEYS|ERR_JOSE_ALG_NOT_ALLOWED|ERR_JOSE_NOT_SUPPORTED)/;

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code; // jose errors carry a stable string code
  return typeof code === 'string' ? code : 'ERR_UNKNOWN';
}

/**
 * Checks signature, issuer, audience and expiry (docs/05-security.md section 1).
 * @throws TokenRejectedError for a bad token, IdentityProviderUnavailableError for an outage.
 */
export async function verifyAccessToken(
  token: string,
  options: VerifyOptions,
): Promise<AuthenticatedUser> {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, options.jwks.getKey, {
      issuer: options.issuer,
      audience: AUDIENCE,
      algorithms: ALGORITHMS,
      requiredClaims: ['sub', 'exp'],
    }));
  } catch (error) {
    const code = errorCode(error);
    throw TOKEN_DEFECT.test(code)
      ? new TokenRejectedError(code)
      : new IdentityProviderUnavailableError(code);
  }
  const { sub, email } = payload;
  if (typeof sub !== 'string' || typeof email !== 'string' || email.length === 0) {
    throw new TokenRejectedError('MISSING_IDENTITY_CLAIMS');
  }
  return { userId: sub, email };
}
