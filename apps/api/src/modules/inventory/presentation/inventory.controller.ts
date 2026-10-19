import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { ADJUST_STOCK } from '../application/adjust-stock';
import type { AdjustStock } from '../application/adjust-stock';
import { LIST_LOW_STOCK, LIST_MOVEMENTS, LIST_STOCK_LEVELS } from '../application/list-stock';
import type { ListLowStock, ListMovements, ListStockLevels } from '../application/list-stock';
import { SET_INITIAL_STOCK } from '../application/set-initial-stock';
import type { SetInitialStock } from '../application/set-initial-stock';
import {
  AdjustStockDto,
  ListMovementsQueryDto,
  ListMovementsResponseDto,
  ListStockLevelsQueryDto,
  ListStockLevelsResponseDto,
  LowStockQueryDto,
  LowStockResponseDto,
  SetInitialStockDto,
  StockChangeDto,
} from './inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(LIST_STOCK_LEVELS) private readonly listStockLevels: ListStockLevels,
    @Inject(LIST_MOVEMENTS) private readonly listMovements: ListMovements,
    @Inject(LIST_LOW_STOCK) private readonly listLowStock: ListLowStock,
    @Inject(ADJUST_STOCK) private readonly adjustStock: AdjustStock,
    @Inject(SET_INITIAL_STOCK) private readonly setInitialStock: SetInitialStock,
  ) {}

  @Get('levels')
  @RequirePermission('inventory.read')
  @ZodSerializerDto(ListStockLevelsResponseDto)
  async levels(@Ctx() ctx: TenantContext, @Query() query: ListStockLevelsQueryDto) {
    return unwrapOrThrow(await this.listStockLevels(ctx, query));
  }

  @Get('movements')
  @RequirePermission('inventory.read')
  @ZodSerializerDto(ListMovementsResponseDto)
  async movements(@Ctx() ctx: TenantContext, @Query() query: ListMovementsQueryDto) {
    return unwrapOrThrow(await this.listMovements(ctx, query));
  }

  @Get('low-stock')
  @RequirePermission('inventory.read')
  @ZodSerializerDto(LowStockResponseDto)
  async lowStock(@Ctx() ctx: TenantContext, @Query() query: LowStockQueryDto) {
    return unwrapOrThrow(await this.listLowStock(ctx, query));
  }

  @Post('adjustments')
  @RequirePermission('inventory.adjust')
  @ZodSerializerDto(StockChangeDto)
  async adjust(@Ctx() ctx: TenantContext, @Body() body: AdjustStockDto) {
    return unwrapOrThrow(await this.adjustStock(ctx, body));
  }

  @Post('initial')
  @RequirePermission('inventory.adjust')
  @ZodSerializerDto(StockChangeDto)
  async initial(@Ctx() ctx: TenantContext, @Body() body: SetInitialStockDto) {
    return unwrapOrThrow(await this.setInitialStock(ctx, body));
  }
}
