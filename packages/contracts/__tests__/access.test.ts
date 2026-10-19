import { describe, expect, it } from 'vitest';
import {
  invitationSchema,
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  listInvitationsResponseSchema,
  meResponseSchema,
  updateMemberRequestSchema,
} from '../src/access/index.js';

describe('invitation list contract', () => {
  const item = {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    email: 'ana@example.com',
    role: 'employee',
    invitedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: '2026-10-22T14:00:00.000Z',
    status: 'pending',
  };

  it('accepts pending and expired items and rejects any other status', () => {
    expect(listInvitationsResponseSchema.safeParse({ items: [item] }).success).toBe(true);
    expect(invitationSchema.safeParse({ ...item, status: 'expired' }).success).toBe(true);
    expect(invitationSchema.safeParse({ ...item, status: 'used' }).success).toBe(false);
  });

  it('strips a token or hash that reaches the serializer, so it can never leave the API', () => {
    // AC-2
    const parsed = invitationSchema.parse({ ...item, token: 'secret', tokenHash: 'abc' });
    expect(Object.keys(parsed).sort()).toEqual(
      ['email', 'expiresAt', 'id', 'invitedAt', 'role', 'status'].sort(),
    );
  });
});

describe('update member contract', () => {
  it('accepts a role, disabled or active, and nothing else or more than one', () => {
    expect(updateMemberRequestSchema.safeParse({ role: 'owner' }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'disabled' }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(updateMemberRequestSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(updateMemberRequestSchema.safeParse({ role: 'owner', status: 'active' }).success).toBe(
      false,
    );
    expect(updateMemberRequestSchema.safeParse({}).success).toBe(false);
  });
});

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
