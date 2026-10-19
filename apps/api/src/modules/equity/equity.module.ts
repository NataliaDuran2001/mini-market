import { Module } from '@nestjs/common';
import type { Clock } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { AUDIT_PORT, permissionsProvider } from '../access';
import type { AuditPort } from '../access';
import { GET_CAPITAL_SUMMARY, getCapitalSummary } from './application/get-capital-summary';
import { LIST_CAPITAL_MOVEMENTS, listCapitalMovements } from './application/list-capital-movements';
import type { CapitalMovementRepository } from './application/ports/capital-movement.repository';
import {
  RECORD_CAPITAL_MOVEMENT,
  recordCapitalMovement,
} from './application/record-capital-movement';
import { CAPITAL_MOVEMENT_REPOSITORY } from './application/tokens';
import { EQUITY_PERMISSIONS } from './equity.permissions';
import { DrizzleCapitalMovementRepository } from './infrastructure/drizzle-capital-movement.repository';
import { CapitalController } from './presentation/capital.controller';

@Module({
  controllers: [CapitalController],
  providers: [
    permissionsProvider('equity', EQUITY_PERMISSIONS),
    {
      provide: CAPITAL_MOVEMENT_REPOSITORY,
      useFactory: () => new DrizzleCapitalMovementRepository(),
    },
    {
      provide: RECORD_CAPITAL_MOVEMENT,
      useFactory: (
        movements: CapitalMovementRepository,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => recordCapitalMovement.bind(null, { movements, audit, clock, withTransaction }),
      inject: [CAPITAL_MOVEMENT_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: LIST_CAPITAL_MOVEMENTS,
      useFactory: (movements: CapitalMovementRepository, withTransaction: WithTransaction) =>
        listCapitalMovements.bind(null, { movements, withTransaction }),
      inject: [CAPITAL_MOVEMENT_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: GET_CAPITAL_SUMMARY,
      useFactory: (movements: CapitalMovementRepository, withTransaction: WithTransaction) =>
        getCapitalSummary.bind(null, { movements, withTransaction }),
      inject: [CAPITAL_MOVEMENT_REPOSITORY, WITH_TRANSACTION],
    },
  ],
  exports: [GET_CAPITAL_SUMMARY],
})
export class EquityModule {}
