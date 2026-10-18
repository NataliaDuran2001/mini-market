export interface GeneratedInvitationToken {
  readonly token: string;
  readonly tokenHash: string;
}

export interface InvitationTokenPort {
  generate(): GeneratedInvitationToken;
  /** The value stored for a token: what `generate` returns as `tokenHash`. */
  hash(token: string): string;
}
