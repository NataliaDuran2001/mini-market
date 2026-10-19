// Public API of the equity module: the only file other modules may import. The monthly report
// (#51) reads net capital through `GET_CAPITAL_SUMMARY` (S8).
export { GET_CAPITAL_SUMMARY } from './application/get-capital-summary';
export type { GetCapitalSummary } from './application/get-capital-summary';
export { summarizeCapital } from './domain/capital-movement';
export type {
  CapitalMovement,
  CapitalMovementKind,
  CapitalSummary,
  CapitalTotals,
} from './domain/capital-movement';
export { EquityModule } from './equity.module';
export { EQUITY_PERMISSIONS } from './equity.permissions';
export { capitalMovements } from './infrastructure/schema';
