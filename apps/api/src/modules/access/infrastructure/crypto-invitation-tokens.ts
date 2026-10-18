import { createHash, randomBytes } from 'node:crypto';
import type {
  GeneratedInvitationToken,
  InvitationTokenPort,
} from '../application/ports/invitation-token.port';

const TOKEN_BYTES = 32;

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 256 random bits; only their SHA-256 is stored, so a database leak does not leak live links. */
export class CryptoInvitationTokens implements InvitationTokenPort {
  generate(): GeneratedInvitationToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, tokenHash: hashInvitationToken(token) };
  }
}
