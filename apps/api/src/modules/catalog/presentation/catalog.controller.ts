import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_CATALOG_ITEM } from '../application/create-catalog-item';
import type { CreateCatalogItem } from '../application/create-catalog-item';
import { LIST_CATALOG } from '../application/list-catalog';
import type { ListCatalog } from '../application/list-catalog';
import { UPDATE_CATALOG_ITEM } from '../application/update-catalog-item';
import type { UpdateCatalogItem } from '../application/update-catalog-item';
import type { CatalogItem } from '@mini-market/contracts/catalog';
import { ListCatalogQueryDto, ListCatalogResponseDto } from './catalog.dto';

// `kind` is one of categories, units, payment-methods, expense-categories. The body depends on it,
// so the use cases validate it with the schema of the kind (packages/contracts/src/catalog).
@Controller('catalogs')
export class CatalogController {
  constructor(
    @Inject(LIST_CATALOG) private readonly listCatalog: ListCatalog,
    @Inject(CREATE_CATALOG_ITEM) private readonly createCatalogItem: CreateCatalogItem,
    @Inject(UPDATE_CATALOG_ITEM) private readonly updateCatalogItem: UpdateCatalogItem,
  ) {}

  @Get(':kind')
  @RequirePermission('catalog.read')
  @ZodSerializerDto(ListCatalogResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Param('kind') kind: string,
    @Query() query: ListCatalogQueryDto,
  ): Promise<{ items: readonly CatalogItem[] }> {
    return { items: unwrapOrThrow(await this.listCatalog(ctx, kind, query)) };
  }

  @Post(':kind')
  @RequirePermission('catalog.write')
  async create(
    @Ctx() ctx: TenantContext,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<CatalogItem> {
    return unwrapOrThrow(await this.createCatalogItem(ctx, kind, body));
  }

  @Patch(':kind/:id')
  @RequirePermission('catalog.write')
  async update(
    @Ctx() ctx: TenantContext,
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CatalogItem> {
    return unwrapOrThrow(await this.updateCatalogItem(ctx, kind, id, body));
  }
}
