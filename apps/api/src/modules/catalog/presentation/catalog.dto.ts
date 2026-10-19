import { listCatalogQuerySchema, listCatalogResponseSchema } from '@mini-market/contracts/catalog';
import { createZodDto } from 'nestjs-zod';

export class ListCatalogResponseDto extends createZodDto(listCatalogResponseSchema) {}
export class ListCatalogQueryDto extends createZodDto(listCatalogQuerySchema) {}
