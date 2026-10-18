/** Who is calling: the Supabase auth user behind a verified access token (ADR 0003). */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly email: string;
}

/** Roles of a membership (docs/01-domain.md section 4). */
export type Role = 'owner' | 'employee';
