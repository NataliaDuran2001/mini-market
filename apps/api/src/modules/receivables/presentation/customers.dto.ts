import {
  createCustomerRequestSchema,
  customerSchema,
  customerStatementSchema,
  listCustomersQuerySchema,
  listCustomersResponseSchema,
  listReceivablesQuerySchema,
  listReceivablesResponseSchema,
  registerCollectionRequestSchema,
  registerCollectionResponseSchema,
  updateCustomerRequestSchema,
} from '@mini-market/contracts/receivables';
import { createZodDto } from 'nestjs-zod';

export class CustomerDto extends createZodDto(customerSchema) {}
export class CreateCustomerRequestDto extends createZodDto(createCustomerRequestSchema) {}
export class UpdateCustomerRequestDto extends createZodDto(updateCustomerRequestSchema) {}
export class ListCustomersQueryDto extends createZodDto(listCustomersQuerySchema) {}
export class ListCustomersResponseDto extends createZodDto(listCustomersResponseSchema) {}
export class CustomerStatementDto extends createZodDto(customerStatementSchema) {}
export class RegisterCollectionRequestDto extends createZodDto(registerCollectionRequestSchema) {}
export class RegisterCollectionResponseDto extends createZodDto(registerCollectionResponseSchema) {}
export class ListReceivablesQueryDto extends createZodDto(listReceivablesQuerySchema) {}
export class ListReceivablesResponseDto extends createZodDto(listReceivablesResponseSchema) {}
