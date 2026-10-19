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

/** Result of `findOrInviteUser`. */
export interface SupabaseUserRef {
  /** The Supabase auth user id (`sub` of its access tokens). */
  readonly userId: string;
  /** True when this call created the account and sent the invitation email. */
  readonly invited: boolean;
}

/** Operator tooling (issue #13): the provisioning script needs the id of the owner it invites. */
export interface SupabaseUserDirectory {
  /**
   * Returns the auth user of `request.email`, inviting the address first when it has no account.
   * An existing account gets no email.
   * @throws on infrastructure failure, or when the account exists but cannot be found.
   */
  findOrInviteUser(request: SupabaseInviteRequest): Promise<SupabaseUserRef>;
}
