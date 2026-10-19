import {
  createSupplierRequestSchema,
  listSuppliersQuerySchema,
  listSuppliersResponseSchema,
  supplierSchema,
  updateSupplierRequestSchema,
} from '@mini-market/contracts/purchasing';
import { createZodDto } from 'nestjs-zod';

export class SupplierDto extends createZodDto(supplierSchema) {}
export class ListSuppliersQueryDto extends createZodDto(listSuppliersQuerySchema) {}
export class ListSuppliersResponseDto extends createZodDto(listSuppliersResponseSchema) {}
export class CreateSupplierRequestDto extends createZodDto(createSupplierRequestSchema) {}
export class UpdateSupplierRequestDto extends createZodDto(updateSupplierRequestSchema) {}
