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

export interface VerifyOptions {
  readonly jwks: JwksProvider;
  /** Value of `SUPABASE_JWT_ISSUER`. */
  readonly issuer: string;
}

const AUDIENCE = 'authenticated';
const ALGORITHMS = ['RS256', 'ES256'];

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown }).code; // jose errors carry a stable string code
  return typeof code === 'string' ? code : 'ERR_UNKNOWN';
}

/** Checks signature, issuer, audience and expiry (docs/05-security.md section 1). */
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
    throw new TokenRejectedError(errorCode(error));
  }
  const { sub, email } = payload;
  if (typeof sub !== 'string' || typeof email !== 'string' || email.length === 0) {
    throw new TokenRejectedError('MISSING_IDENTITY_CLAIMS');
  }
  return { userId: sub, email };
}
