// Contracts of the access module. Import as `@mini-market/contracts/access`.
import { z } from 'zod';
import { uuidSchema } from '../common/index.js';

const roleSchema = z.enum(['owner', 'employee']);

/** `GET /api/v1/me` */
export const meResponseSchema = z.object({
  userId: uuidSchema,
  email: z.string(),
});

/** One business of the signed-in user, for the tenant picker. `GET /api/v1/me/tenants` */
export const myTenantSchema = z.object({
  tenantId: uuidSchema,
  slug: z.string(),
  name: z.string(),
  role: roleSchema,
});
export const myTenantsResponseSchema = z.object({ items: z.array(myTenantSchema) });

/** `POST /api/v1/auth/invitations` (owner only). Employees are the only role that can be invited. */
export const inviteMemberRequestSchema = z.object({
  // The web may send the address as typed; it is stored trimmed and lower case.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  role: z.literal('employee'),
});

export const inviteMemberResponseSchema = z.object({
  invitationId: uuidSchema,
  email: z.string(),
  role: roleSchema,
  expiresAt: z.iso.datetime(),
});

/** `POST /api/v1/invitations/accept`: the token comes from the link in the invitation email. */
export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(16).max(256),
});
export const acceptInvitationResponseSchema = z.object({
  tenantId: uuidSchema,
  role: roleSchema,
});

export const memberSchema = z.object({
  userId: uuidSchema,
  email: z.string(),
  role: roleSchema,
  status: z.enum(['active', 'disabled']),
});

/** `GET /api/v1/members` (owner only) */
export const listMembersResponseSchema = z.object({ items: z.array(memberSchema) });

/**
 * `PATCH /api/v1/members/:userId` (owner only): change the role, or set the status to `disabled`
 * or back to `active`. Exactly one of the two; a member is never deleted.
 */
export const updateMemberRequestSchema = z
  .object({ role: roleSchema.optional(), status: z.enum(['disabled', 'active']).optional() })
  .strict()
  .refine((body) => (body.role === undefined) !== (body.status === undefined), {
    message: 'Send exactly one of role or status',
  });

/**
 * One invitation that was sent and not used. It never carries the token or its hash: the token
 * only travels in the email link. `GET /api/v1/invitations` (owner only), newest first.
 */
export const invitationSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  role: roleSchema,
  invitedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  status: z.enum(['pending', 'expired']),
});
export const listInvitationsResponseSchema = z.object({ items: z.array(invitationSchema) });

export type MeResponse = z.infer<typeof meResponseSchema>;
export type MyTenant = z.infer<typeof myTenantSchema>;
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type ListInvitationsResponse = z.infer<typeof listInvitationsResponseSchema>;
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
