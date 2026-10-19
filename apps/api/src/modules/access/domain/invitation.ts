import type { Role } from './identity';

/** An invitation stays valid for this many days after the owner sends it. */
export const INVITATION_TTL_DAYS = 7;

const MILLISECONDS_PER_DAY = 86_400_000;

export interface PendingInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly role: Role;
  readonly invitedBy: string;
  readonly expiresAt: Date;
}

/** Emails are compared case-insensitively; the stored form is trimmed and lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * MILLISECONDS_PER_DAY);
}

/** An invitation that was sent and not accepted yet; it may be past its expiry. */
export interface OpenInvitation {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly role: Role;
  readonly invitedAt: Date;
  readonly expiresAt: Date;
}

export type InvitationStatus = 'pending' | 'expired';

/** An invitation is usable until the instant it expires. */
export function invitationStatus(expiresAt: Date, now: Date): InvitationStatus {
  return expiresAt.getTime() > now.getTime() ? 'pending' : 'expired';
}
