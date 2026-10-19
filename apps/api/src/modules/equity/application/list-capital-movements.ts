import type { PaginationQuery } from '@mini-market/contracts/common';
import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import type { CapitalMovement } from '../domain/capital-movement';
import type { CapitalMovementRepository } from './ports/capital-movement.repository';

export const LIST_CAPITAL_MOVEMENTS = Symbol('LIST_CAPITAL_MOVEMENTS');

export interface CapitalMovementsView {
  readonly items: readonly CapitalMovement[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export type ListCapitalMovements = (
  ctx: TenantContext,
  query: PaginationQuery,
) => Promise<Result<CapitalMovementsView, DomainError>>;

export interface ListCapitalMovementsDeps {
  readonly movements: CapitalMovementRepository;
  readonly withTransaction: WithTransaction;
}

export async function listCapitalMovements(
  deps: ListCapitalMovementsDeps,
  ctx: TenantContext,
  query: PaginationQuery,
): Promise<Result<CapitalMovementsView, DomainError>> {
  const allowed = requirePermission(ctx, 'equity.read');
  if (!allowed.ok) return allowed;
  const { items, total } = await deps.withTransaction(ctx, (tx) =>
    deps.movements.list(tx, ctx.tenantId, {
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    }),
  );
  return ok({ items, page: query.page, pageSize: query.pageSize, total });
}
