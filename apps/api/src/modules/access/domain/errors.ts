import { DomainError } from '@mini-market/shared-kernel';

/** The caller has no active membership in the tenant named by `X-Tenant-Id`. */
export class NotAMemberError extends DomainError {
  readonly code = 'NOT_A_MEMBER';
  readonly httpStatus = 403;
}

/**
 * The invitation is stored but the email provider refused or did not answer. The owner can send
 * it again; nothing else is lost.
 */
export class InviteDeliveryFailedError extends DomainError {
  readonly code = 'INVITE_DELIVERY_FAILED';
  readonly httpStatus = 502;
}
