import type { RecordCapitalMovementRequest } from '@mini-market/contracts/equity';
import { Money, Period, err, ok } from '@mini-market/shared-kernel';
import type { Clock, DomainError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { AuditPort, TenantContext } from '../../access';
import { exceedsNetCapital } from '../domain/capital-movement';
import type { CapitalMovement } from '../domain/capital-movement';
import type { CapitalMovementRepository } from './ports/capital-movement.repository';

export const RECORD_CAPITAL_MOVEMENT = Symbol('RECORD_CAPITAL_MOVEMENT');

export interface RecordedCapitalMovement {
  readonly movement: CapitalMovement;
  /** S8: the withdrawal left the net capital below zero. Allowed, the owner decides. */
  readonly warning: boolean;
}

export type RecordCapitalMovement = (
  ctx: TenantContext,
  input: RecordCapitalMovementRequest,
) => Promise<Result<RecordedCapitalMovement, DomainError>>;

export interface RecordCapitalMovementDeps {
  readonly movements: CapitalMovementRepository;
  readonly audit: AuditPort;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

/** Instant a movement is stamped with: now for today, the first instant of the day otherwise. */
function occurredAtOf(
  occurredOn: string | undefined,
  now: Date,
  timeZone: string,
): Result<Date, DomainError> {
  if (occurredOn === undefined || occurredOn === Period.dayKey(now, timeZone)) return ok(now);
  const range = Period.dayRange(occurredOn, timeZone);
  return range.ok ? ok(range.value.start) : range;
}

/** S8: the owner records a contribution or a withdrawal. Never edited afterwards. */
export async function recordCapitalMovement(
  deps: RecordCapitalMovementDeps,
  ctx: TenantContext,
  input: RecordCapitalMovementRequest,
): Promise<Result<RecordedCapitalMovement, DomainError>> {
  const allowed = requirePermission(ctx, 'equity.record');
  if (!allowed.ok) return allowed;

  const now = deps.clock.now();
  const occurredAt = occurredAtOf(input.occurredOn, now, ctx.settings.timezone);
  if (!occurredAt.ok) return err(occurredAt.error);
  const amount = Money.fromCentavos(input.amountCentavos);
  const note = input.note === undefined || input.note === '' ? null : input.note;

  return ok(
    await deps.withTransaction(ctx, async (tx) => {
      const before = await deps.movements.totals(tx, ctx.tenantId);
      const movement = await deps.movements.insert(tx, ctx.tenantId, {
        kind: input.kind,
        amount,
        occurredAt: occurredAt.value,
        note,
        createdBy: ctx.userId,
      });
      const warning = exceedsNetCapital(before, movement);
      await deps.audit.record(tx, {
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'capital.recorded',
        entity: 'capital_movement',
        entityId: movement.id,
        after: {
          kind: movement.kind,
          amountCentavos: input.amountCentavos,
          exceedsNetCapital: warning,
        },
        at: now,
      });
      return { movement, warning };
    }),
  );
}
