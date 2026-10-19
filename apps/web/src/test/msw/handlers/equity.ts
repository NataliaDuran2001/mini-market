import type {
  CapitalMovement,
  CapitalSummary,
  ListCapitalMovementsResponse,
  RecordCapitalMovementRequest,
  RecordCapitalMovementResponse,
} from '@mini-market/contracts/equity';
import { http, HttpResponse } from 'msw';
import { apiUrl } from '../api-url';

export const CAPITAL_USER_ID = '33333333-3333-4333-8333-333333333333';

export function aMovement(overrides: Partial<CapitalMovement> = {}): CapitalMovement {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'contribution',
    amountCentavos: 1_000_000,
    occurredAt: '2026-10-05T04:00:00.000Z',
    note: null,
    createdBy: CAPITAL_USER_ID,
    ...overrides,
  };
}

export function summaryOf(movements: readonly CapitalMovement[]): CapitalSummary {
  const sum = (kind: CapitalMovement['kind']) =>
    movements
      .filter((movement) => movement.kind === kind)
      .reduce((total, movement) => total + movement.amountCentavos, 0);
  const contributedCentavos = sum('contribution');
  const withdrawnCentavos = sum('withdrawal');
  return {
    contributedCentavos,
    withdrawnCentavos,
    netCentavos: contributedCentavos - withdrawnCentavos,
  };
}

/**
 * A ledger kept in memory, for tests: the three capital endpoints answer from it and the POST
 * appends to it, so a test can watch the summary change after a save.
 */
export function capitalHandlers(initial: readonly CapitalMovement[] = []) {
  const ledger = [...initial];
  let nextId = 100;
  return [
    http.get(apiUrl('/capital/summary'), () => HttpResponse.json(summaryOf(ledger))),
    http.get(apiUrl('/capital/movements'), () =>
      HttpResponse.json({
        items: [...ledger].reverse(),
        page: 1,
        pageSize: 20,
        total: ledger.length,
      } satisfies ListCapitalMovementsResponse),
    ),
    http.post(apiUrl('/capital/movements'), async ({ request }) => {
      const body = (await request.json()) as RecordCapitalMovementRequest;
      const before = summaryOf(ledger).netCentavos;
      const movement = aMovement({
        id: `55555555-5555-4555-8555-${String(nextId++).padStart(12, '0')}`,
        kind: body.kind,
        amountCentavos: body.amountCentavos,
        note: body.note ?? null,
      });
      ledger.push(movement);
      const warning = body.kind === 'withdrawal' && before - body.amountCentavos < 0;
      return HttpResponse.json({ ...movement, warning } satisfies RecordCapitalMovementResponse);
    }),
  ];
}

// Default: a business without movements (read only, so no test leaks state into the next). Tests
// that record movements use server.use(...capitalHandlers(...)).
export const handlers = capitalHandlers().slice(0, 2);
