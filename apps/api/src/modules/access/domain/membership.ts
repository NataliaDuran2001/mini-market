import type { Role } from './identity';

export type MemberStatus = 'active' | 'disabled';

/** A user's membership of a tenant (docs/01-domain.md section 3). */
export interface Member {
  readonly userId: string;
  readonly email: string;
  readonly role: Role;
  readonly status: MemberStatus;
}

/** What a user may do in a tenant: `null` means no active membership. */
export interface ActiveMembership {
  readonly role: Role;
}

/** A tenant with a name for the picker of the web, and the role of the caller in it. */
export interface MyTenant {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly role: Role;
}

/**
 * The tenant must keep at least one active owner, or nobody could manage it again. True when
 * demoting or disabling `member` would leave no owner behind.
 */
export function wouldLeaveNoOwner(
  member: { readonly role: Role; readonly status: MemberStatus },
  activeOwners: number,
): boolean {
  return member.role === 'owner' && member.status === 'active' && activeOwners <= 1;
}
