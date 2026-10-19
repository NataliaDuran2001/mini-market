import {
  adjustStockInputSchema,
  listMovementsQuerySchema,
  listMovementsResponseSchema,
  listStockLevelsQuerySchema,
  listStockLevelsResponseSchema,
  lowStockQuerySchema,
  lowStockResponseSchema,
  setInitialStockInputSchema,
  stockChangeSchema,
} from '@mini-market/contracts/inventory';
import { createZodDto } from 'nestjs-zod';

export class AdjustStockDto extends createZodDto(adjustStockInputSchema) {}
export class SetInitialStockDto extends createZodDto(setInitialStockInputSchema) {}
export class StockChangeDto extends createZodDto(stockChangeSchema) {}
export class ListStockLevelsQueryDto extends createZodDto(listStockLevelsQuerySchema) {}
export class ListStockLevelsResponseDto extends createZodDto(listStockLevelsResponseSchema) {}
export class ListMovementsQueryDto extends createZodDto(listMovementsQuerySchema) {}
export class ListMovementsResponseDto extends createZodDto(listMovementsResponseSchema) {}
export class LowStockQueryDto extends createZodDto(lowStockQuerySchema) {}
export class LowStockResponseDto extends createZodDto(lowStockResponseSchema) {}
