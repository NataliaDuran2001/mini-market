import type {
  CapitalMovement as CapitalMovementDto,
  CapitalSummary as CapitalSummaryDto,
  ListCapitalMovementsResponse,
  RecordCapitalMovementResponse,
} from '@mini-market/contracts/equity';
import type { Money } from '@mini-market/shared-kernel';
import type { CapitalMovementsView } from '../application/list-capital-movements';
import type { RecordedCapitalMovement } from '../application/record-capital-movement';
import type { CapitalMovement, CapitalSummary } from '../application/views';

/**
 * Wire money is a safe integer of centavos (`moneySchema`); the response schema checks it. A
 * ledger total above Number.MAX_SAFE_INTEGER (about Bs 90 trillion) is out of range by decision.
 */
const centavos = (money: Money): number => Number(money.toCentavos());

export const toMovementDto = (movement: CapitalMovement): CapitalMovementDto => ({
  id: movement.id,
  kind: movement.kind,
  amountCentavos: centavos(movement.amount),
  occurredAt: movement.occurredAt.toISOString(),
  note: movement.note,
  createdBy: movement.createdBy,
});

export const toRecordedDto = (
  recorded: RecordedCapitalMovement,
): RecordCapitalMovementResponse => ({
  ...toMovementDto(recorded.movement),
  warning: recorded.warning,
});

export const toListDto = (view: CapitalMovementsView): ListCapitalMovementsResponse => ({
  items: view.items.map(toMovementDto),
  page: view.page,
  pageSize: view.pageSize,
  total: view.total,
});

export const toSummaryDto = (summary: CapitalSummary): CapitalSummaryDto => ({
  contributedCentavos: centavos(summary.contributed),
  withdrawnCentavos: centavos(summary.withdrawn),
  netCentavos: centavos(summary.net),
});
