export interface GeneratedInvitationToken {
  readonly token: string;
  readonly tokenHash: string;
}

export interface InvitationTokenPort {
  generate(): GeneratedInvitationToken;
}
