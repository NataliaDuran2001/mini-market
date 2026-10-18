export interface SupabaseInviteRequest {
  readonly email: string;
  /** Where the invitee lands after following the email link. */
  readonly redirectTo: string;
}

/** Supabase Admin API, service role. Server side only (docs/05-security.md section 5). */
export interface SupabaseAdminPort {
  /**
   * Sends the invitation email. An address that already has an account is not an error and is not
   * reported: the answer must not tell an owner whether a person is registered anywhere.
   * @throws on infrastructure failure (network, rate limit, misconfiguration).
   */
  inviteUserByEmail(request: SupabaseInviteRequest): Promise<void>;
}
