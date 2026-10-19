import type { ListReceivablesResponse } from '@mini-market/contracts/receivables';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { LIST_BALANCES } from '../application/list-balances';
import type { ListBalances } from '../application/list-balances';
import { ListReceivablesQueryDto, ListReceivablesResponseDto } from './customers.dto';
import { toReceivablesDto } from './customers.mapper';

@Controller('receivables')
export class ReceivablesController {
  constructor(@Inject(LIST_BALANCES) private readonly listBalances: ListBalances) {}

  @Get()
  @RequirePermission('receivables.read')
  @ZodSerializerDto(ListReceivablesResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Query() query: ListReceivablesQueryDto,
  ): Promise<ListReceivablesResponse> {
    return toReceivablesDto(unwrapOrThrow(await this.listBalances(ctx, query)));
  }
}
