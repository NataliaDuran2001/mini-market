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

export class MemberNotFoundError extends DomainError {
  readonly code = 'MEMBER_NOT_FOUND';
  readonly httpStatus = 404;
}

/** Demoting or disabling the last active owner would leave the tenant without a manager. */
export class LastOwnerError extends DomainError {
  readonly code = 'LAST_OWNER';
  readonly httpStatus = 409;
}

/**
 * Unknown token, or a token of an invitation for another email: one answer for both, so a token
 * holder learns nothing about whom it was meant for.
 */
export class InvitationNotFoundError extends DomainError {
  readonly code = 'INVITATION_NOT_FOUND';
  readonly httpStatus = 404;
}

export class InvitationExpiredError extends DomainError {
  readonly code = 'INVITATION_EXPIRED';
  readonly httpStatus = 410;
}

export class InvitationAlreadyUsedError extends DomainError {
  readonly code = 'INVITATION_ALREADY_USED';
  readonly httpStatus = 409;
}
