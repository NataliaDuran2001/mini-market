import {
  createExpenseRequestSchema,
  createRecurringExpenseRequestSchema,
  expenseSchema,
  listExpensesQuerySchema,
  listExpensesResponseSchema,
  listRecurringExpensesResponseSchema,
  payExpenseRequestSchema,
  recurringExpenseSchema,
  updateExpenseRequestSchema,
  updateRecurringExpenseRequestSchema,
} from '@mini-market/contracts/payables';
import { createZodDto } from 'nestjs-zod';

export class ExpenseDto extends createZodDto(expenseSchema) {}
export class ListExpensesQueryDto extends createZodDto(listExpensesQuerySchema) {}
export class ListExpensesResponseDto extends createZodDto(listExpensesResponseSchema) {}
export class CreateExpenseRequestDto extends createZodDto(createExpenseRequestSchema) {}
export class UpdateExpenseRequestDto extends createZodDto(updateExpenseRequestSchema) {}
export class PayExpenseRequestDto extends createZodDto(payExpenseRequestSchema) {}
export class RecurringExpenseDto extends createZodDto(recurringExpenseSchema) {}
export class ListRecurringExpensesResponseDto extends createZodDto(
  listRecurringExpensesResponseSchema,
) {}
export class CreateRecurringExpenseRequestDto extends createZodDto(
  createRecurringExpenseRequestSchema,
) {}
export class UpdateRecurringExpenseRequestDto extends createZodDto(
  updateRecurringExpenseRequestSchema,
) {}
