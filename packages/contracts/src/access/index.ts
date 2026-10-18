// Contracts of the access module. Import as `@mini-market/contracts/access`.
import { z } from 'zod';
import { uuidSchema } from '../common/index.js';

/** `GET /api/v1/me` */
export const meResponseSchema = z.object({
  userId: uuidSchema,
  email: z.string(),
});

/** `POST /api/v1/auth/invitations` (owner only). Employees are the only role that can be invited. */
export const inviteMemberRequestSchema = z.object({
  email: z.email().max(254),
  role: z.literal('employee'),
});

export const inviteMemberResponseSchema = z.object({
  invitationId: uuidSchema,
  email: z.string(),
  role: z.enum(['owner', 'employee']),
  expiresAt: z.iso.datetime(),
  /** `existing_user`: the email already has an account and accepts the invitation with it. */
  delivery: z.enum(['invited', 'existing_user']),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;
