import type {
  Expense as ExpenseResponse,
  ListExpensesResponse,
} from '@mini-market/contracts/payables';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_EXPENSE } from '../application/create-expense';
import type { CreateExpense } from '../application/create-expense';
import { LIST_EXPENSES } from '../application/list-expenses';
import type { ListExpenses } from '../application/list-expenses';
import { parseId } from '../application/parse-id';
import { PAY_EXPENSE } from '../application/pay-expense';
import type { PayExpense } from '../application/pay-expense';
import { UPDATE_EXPENSE } from '../application/update-expense';
import type { UpdateExpense } from '../application/update-expense';
import {
  CreateExpenseRequestDto,
  ExpenseDto,
  ListExpensesQueryDto,
  ListExpensesResponseDto,
  PayExpenseRequestDto,
  UpdateExpenseRequestDto,
} from './payables.dto';
import { toExpenseDto, toExpensesDto } from './payables.mapper';

@Controller('expenses')
export class ExpensesController {
  constructor(
    @Inject(LIST_EXPENSES) private readonly listExpenses: ListExpenses,
    @Inject(CREATE_EXPENSE) private readonly createExpense: CreateExpense,
    @Inject(UPDATE_EXPENSE) private readonly updateExpense: UpdateExpense,
    @Inject(PAY_EXPENSE) private readonly payExpense: PayExpense,
  ) {}

  @Get()
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(ListExpensesResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Query() query: ListExpensesQueryDto,
  ): Promise<ListExpensesResponse> {
    return toExpensesDto(unwrapOrThrow(await this.listExpenses(ctx, query)));
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(ExpenseDto)
  async create(
    @Ctx() ctx: TenantContext,
    @Body() body: CreateExpenseRequestDto,
  ): Promise<ExpenseResponse> {
    return toExpenseDto(unwrapOrThrow(await this.createExpense(ctx, body)));
  }

  @Patch(':id')
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(ExpenseDto)
  async update(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: UpdateExpenseRequestDto,
  ): Promise<ExpenseResponse> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toExpenseDto(unwrapOrThrow(await this.updateExpense(ctx, id, body)));
  }

  @Post(':id/payments')
  @HttpCode(201)
  @RequirePermission('expenses.manage')
  @ZodSerializerDto(ExpenseDto)
  async pay(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: PayExpenseRequestDto,
  ): Promise<ExpenseResponse> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toExpenseDto(unwrapOrThrow(await this.payExpense(ctx, id, body)));
  }
}
