import {
  capitalSummarySchema,
  listCapitalMovementsQuerySchema,
  listCapitalMovementsResponseSchema,
  recordCapitalMovementRequestSchema,
  recordCapitalMovementResponseSchema,
} from '@mini-market/contracts/equity';
import { createZodDto } from 'nestjs-zod';

export class RecordCapitalMovementRequestDto extends createZodDto(
  recordCapitalMovementRequestSchema,
) {}
export class RecordCapitalMovementResponseDto extends createZodDto(
  recordCapitalMovementResponseSchema,
) {}
export class ListCapitalMovementsQueryDto extends createZodDto(listCapitalMovementsQuerySchema) {}
export class ListCapitalMovementsResponseDto extends createZodDto(
  listCapitalMovementsResponseSchema,
) {}
export class CapitalSummaryDto extends createZodDto(capitalSummarySchema) {}
