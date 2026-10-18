export interface SupabaseInviteRequest {
  readonly email: string;
  /** Where the invitee lands after following the email link. */
  readonly redirectTo: string;
}

/** `already_registered`: the email has a Supabase account, so no invite email is sent. */
export type SupabaseInviteOutcome = 'invited' | 'already_registered';

/** Supabase Admin API, service role. Server side only (docs/05-security.md section 5). */
export interface SupabaseAdminPort {
  /** @throws on infrastructure failure (network, rate limit, misconfiguration). */
  inviteUserByEmail(request: SupabaseInviteRequest): Promise<SupabaseInviteOutcome>;
}
