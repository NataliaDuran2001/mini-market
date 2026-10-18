import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { Member } from '../domain/membership';
import type { TenantContext } from '../domain/tenant-context';
import type { MembershipRepository } from './ports/membership.repository';
import { requirePermission } from './require-permission';
import { ok } from '@mini-market/shared-kernel';

export const LIST_MEMBERS = Symbol('LIST_MEMBERS');

export type ListMembers = (ctx: TenantContext) => Promise<Result<readonly Member[], DomainError>>;

export interface ListMembersDeps {
  readonly memberships: MembershipRepository;
  readonly withTransaction: WithTransaction;
}

export async function listMembers(
  deps: ListMembersDeps,
  ctx: TenantContext,
): Promise<Result<readonly Member[], DomainError>> {
  const allowed = requirePermission(ctx, 'members.manage');
  if (!allowed.ok) return allowed;
  return ok(await deps.withTransaction(ctx, (tx) => deps.memberships.list(tx, ctx.tenantId)));
}
