import { inviteMemberRequestSchema, type InviteMemberRequest } from '@mini-market/contracts/access';
import { z } from 'zod';

/**
 * Form of the invite sheet. Only the email is typed; the role is always `employee` (the only role
 * that can be invited), so `toInviteRequest` adds it and parses the result with the contract
 * schema: the form can never send what the API would reject. Messages are i18n keys.
 */
export const inviteFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'team:validation.emailRequired')
    .pipe(z.email('team:validation.emailInvalid').max(254, 'team:validation.emailInvalid')),
});

export type InviteFormValues = z.infer<typeof inviteFormSchema>;

/** Only for values that passed `inviteFormSchema`. */
export function toInviteRequest(values: InviteFormValues): InviteMemberRequest {
  return inviteMemberRequestSchema.parse({ email: values.email, role: 'employee' });
}
