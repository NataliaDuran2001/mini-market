import { describe, expect, it } from 'vitest';
import {
  INVITATION_TTL_DAYS,
  invitationExpiry,
  invitationStatus,
  normalizeEmail,
} from './invitation';

describe('invitation status', () => {
  const expiresAt = new Date('2026-10-22T14:00:00Z');

  it('is pending before the expiry and expired from that instant on', () => {
    expect(invitationStatus(expiresAt, new Date('2026-10-22T13:59:59Z'))).toBe('pending');
    expect(invitationStatus(expiresAt, expiresAt)).toBe('expired');
    expect(invitationStatus(expiresAt, new Date('2026-10-23T00:00:00Z'))).toBe('expired');
  });
});

describe('invitation rules', () => {
  it('stores emails trimmed and lower case so the same person is not invited twice', () => {
    expect(normalizeEmail('  Ana.Perez@Example.COM ')).toBe('ana.perez@example.com');
  });

  it('expires an invitation seven days after it is sent', () => {
    const sentAt = new Date('2026-10-15T14:00:00Z');
    expect(INVITATION_TTL_DAYS).toBe(7);
    expect(invitationExpiry(sentAt).toISOString()).toBe('2026-10-22T14:00:00.000Z');
  });
});
