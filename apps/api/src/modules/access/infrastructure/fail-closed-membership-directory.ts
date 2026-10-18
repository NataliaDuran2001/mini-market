import type { MembershipDirectory } from '../application/ports/membership-directory.port';

/**
 * Placeholder until issue #11 adds the `memberships` table: nobody is a member, so every
 * tenant-scoped action answers NOT_A_MEMBER instead of guessing a role.
 */
export class FailClosedMembershipDirectory implements MembershipDirectory {
  roleOf(): Promise<null> {
    return Promise.resolve(null);
  }
}
