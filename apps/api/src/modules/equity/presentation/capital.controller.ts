import type {
  CapitalSummary,
  ListCapitalMovementsResponse,
  RecordCapitalMovementResponse,
} from '@mini-market/contracts/equity';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { GET_CAPITAL_SUMMARY } from '../application/get-capital-summary';
import type { GetCapitalSummary } from '../application/get-capital-summary';
import { LIST_CAPITAL_MOVEMENTS } from '../application/list-capital-movements';
import type { ListCapitalMovements } from '../application/list-capital-movements';
import { RECORD_CAPITAL_MOVEMENT } from '../application/record-capital-movement';
import type { RecordCapitalMovement } from '../application/record-capital-movement';
import { toListDto, toRecordedDto, toSummaryDto } from './capital.mapper';
import {
  CapitalSummaryDto,
  ListCapitalMovementsQueryDto,
  ListCapitalMovementsResponseDto,
  RecordCapitalMovementRequestDto,
  RecordCapitalMovementResponseDto,
} from './equity.dto';

@Controller('capital')
export class CapitalController {
  constructor(
    @Inject(RECORD_CAPITAL_MOVEMENT) private readonly recordMovement: RecordCapitalMovement,
    @Inject(LIST_CAPITAL_MOVEMENTS) private readonly listMovements: ListCapitalMovements,
    @Inject(GET_CAPITAL_SUMMARY) private readonly getSummary: GetCapitalSummary,
  ) {}

  @Post('movements')
  @HttpCode(200)
  @RequirePermission('equity.record')
  @ZodSerializerDto(RecordCapitalMovementResponseDto)
  async record(
    @Ctx() ctx: TenantContext,
    @Body() body: RecordCapitalMovementRequestDto,
  ): Promise<RecordCapitalMovementResponse> {
    return toRecordedDto(unwrapOrThrow(await this.recordMovement(ctx, body)));
  }

  @Get('movements')
  @RequirePermission('equity.read')
  @ZodSerializerDto(ListCapitalMovementsResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Query() query: ListCapitalMovementsQueryDto,
  ): Promise<ListCapitalMovementsResponse> {
    return toListDto(unwrapOrThrow(await this.listMovements(ctx, query)));
  }

  @Get('summary')
  @RequirePermission('equity.read')
  @ZodSerializerDto(CapitalSummaryDto)
  async summary(@Ctx() ctx: TenantContext): Promise<CapitalSummary> {
    return toSummaryDto(unwrapOrThrow(await this.getSummary(ctx)));
  }
}
