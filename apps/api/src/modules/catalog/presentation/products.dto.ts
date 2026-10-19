import {
  createProductInputSchema,
  searchProductsQuerySchema,
  searchProductsResponseSchema,
  setProductActiveInputSchema,
  updateProductInputSchema,
} from '@mini-market/contracts/catalog';
import { createZodDto } from 'nestjs-zod';

export class CreateProductDto extends createZodDto(createProductInputSchema) {}
export class UpdateProductDto extends createZodDto(updateProductInputSchema) {}
export class SetProductActiveDto extends createZodDto(setProductActiveInputSchema) {}
export class SearchProductsQueryDto extends createZodDto(searchProductsQuerySchema) {}
export class SearchProductsResponseDto extends createZodDto(searchProductsResponseSchema) {}
