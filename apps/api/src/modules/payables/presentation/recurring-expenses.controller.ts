import type {
  ListRecurringExpensesResponse,
  RecurringExpense as RecurringExpenseResponse,
} from '@mini-market/contracts/payables';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_RECURRING_EXPENSE } from '../application/create-recurring-expense';
import type { CreateRecurringExpense } from '../application/create-recurring-expense';
import { LIST_RECURRING_EXPENSES } from '../application/list-recurring-expenses';
import type { ListRecurringExpenses } from '../application/list-recurring-expenses';
import { parseId } from '../application/parse-id';
import { UPDATE_RECURRING_EXPENSE } from '../application/update-recurring-expense';
import type { UpdateRecurringExpense } from '../application/update-recurring-expense';
import {
  CreateRecurringExpenseRequestDto,
  ListRecurringExpensesResponseDto,
  RecurringExpenseDto,
  UpdateRecurringExpenseRequestDto,
} from './payables.dto';
import { toRecurringDto } from './payables.mapper';

@Controller('recurring-expenses')
export class RecurringExpensesController {
  constructor(
    @Inject(LIST_RECURRING_EXPENSES) private readonly listRecurring: ListRecurringExpenses,
    @Inject(CREATE_RECURRING_EXPENSE) private readonly createRecurring: CreateRecurringExpense,
    @Inject(UPDATE_RECURRING_EXPENSE) private readonly updateRecurring: UpdateRecurringExpense,
  ) {}

  @Get()
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(ListRecurringExpensesResponseDto)
  async list(@Ctx() ctx: TenantContext): Promise<ListRecurringExpensesResponse> {
    return { items: unwrapOrThrow(await this.listRecurring(ctx)).map(toRecurringDto) };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(RecurringExpenseDto)
  async create(
    @Ctx() ctx: TenantContext,
    @Body() body: CreateRecurringExpenseRequestDto,
  ): Promise<RecurringExpenseResponse> {
    return toRecurringDto(unwrapOrThrow(await this.createRecurring(ctx, body)));
  }

  @Patch(':id')
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(RecurringExpenseDto)
  async update(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: UpdateRecurringExpenseRequestDto,
  ): Promise<RecurringExpenseResponse> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toRecurringDto(unwrapOrThrow(await this.updateRecurring(ctx, id, body)));
  }
}
