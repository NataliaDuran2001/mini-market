import { describe, expect, it } from 'vitest';
import {
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  meResponseSchema,
} from '../src/access/index.js';

describe('access contracts', () => {
  it('accepts an invitation for an employee and rejects other roles and malformed emails', () => {
    expect(
      inviteMemberRequestSchema.safeParse({ email: 'ana@example.com', role: 'employee' }).success,
    ).toBe(true);
    expect(
      inviteMemberRequestSchema.safeParse({ email: 'ana@example.com', role: 'owner' }).success,
    ).toBe(false);
    expect(
      inviteMemberRequestSchema.safeParse({ email: 'not an email', role: 'employee' }).success,
    ).toBe(false);
    expect(inviteMemberRequestSchema.safeParse({ email: 'ana@example.com' }).success).toBe(false);
  });

  it('trims and lower-cases the invited email', () => {
    const parsed = inviteMemberRequestSchema.parse({
      email: '  Ana.Perez@Example.COM ',
      role: 'employee',
    });
    expect(parsed.email).toBe('ana.perez@example.com');
  });

  it('describes the invitation response with an ISO expiry', () => {
    const response = {
      invitationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      email: 'ana@example.com',
      role: 'employee',
      expiresAt: '2026-10-22T14:00:00.000Z',
      delivery: 'invited',
    };
    expect(inviteMemberResponseSchema.safeParse(response).success).toBe(true);
    expect(
      inviteMemberResponseSchema.safeParse({ ...response, expiresAt: 'tomorrow' }).success,
    ).toBe(false);
  });

  it('describes the caller of GET /me', () => {
    const me = { userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', email: 'ana@example.com' };
    expect(meResponseSchema.safeParse(me).success).toBe(true);
    expect(meResponseSchema.safeParse({ ...me, userId: 'x' }).success).toBe(false);
  });
});
