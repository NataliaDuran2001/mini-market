import { DomainError } from '@mini-market/shared-kernel';

/** The caller has no active membership in the tenant named by `X-Tenant-Id`. */
export class NotAMemberError extends DomainError {
  readonly code = 'NOT_A_MEMBER';
  readonly httpStatus = 403;
}
