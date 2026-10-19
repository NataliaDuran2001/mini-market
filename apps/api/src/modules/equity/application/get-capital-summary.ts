import { ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { summarizeCapital } from '../domain/capital-movement';
import type { CapitalSummary } from '../domain/capital-movement';
import type { CapitalMovementRepository } from './ports/capital-movement.repository';

export const GET_CAPITAL_SUMMARY = Symbol('GET_CAPITAL_SUMMARY');

export type GetCapitalSummary = (
  ctx: TenantContext,
) => Promise<Result<CapitalSummary, DomainError>>;

export interface GetCapitalSummaryDeps {
  readonly movements: CapitalMovementRepository;
  readonly withTransaction: WithTransaction;
}

/** S8: total contributed, total withdrawn and net capital of the business. */
export async function getCapitalSummary(
  deps: GetCapitalSummaryDeps,
  ctx: TenantContext,
): Promise<Result<CapitalSummary, DomainError>> {
  const allowed = requirePermission(ctx, 'equity.read');
  if (!allowed.ok) return allowed;
  const totals = await deps.withTransaction(ctx, (tx) => deps.movements.totals(tx, ctx.tenantId));
  return ok(summarizeCapital(totals));
}
