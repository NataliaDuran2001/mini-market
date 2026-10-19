import type { Product } from '@mini-market/contracts/catalog';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_PRODUCT } from '../application/create-product';
import type { CreateProduct } from '../application/create-product';
import { GET_PRODUCT } from '../application/get-product';
import type { GetProduct } from '../application/get-product';
import { SEARCH_PRODUCTS } from '../application/search-products';
import type { SearchProducts } from '../application/search-products';
import { SET_PRODUCT_ACTIVE } from '../application/set-product-active';
import type { SetProductActive } from '../application/set-product-active';
import { UPDATE_PRODUCT } from '../application/update-product';
import type { UpdateProduct } from '../application/update-product';
import {
  CreateProductDto,
  SearchProductsQueryDto,
  SearchProductsResponseDto,
  SetProductActiveDto,
  UpdateProductDto,
} from './products.dto';

@Controller('products')
export class ProductsController {
  constructor(
    @Inject(SEARCH_PRODUCTS) private readonly searchProducts: SearchProducts,
    @Inject(GET_PRODUCT) private readonly getProduct: GetProduct,
    @Inject(CREATE_PRODUCT) private readonly createProduct: CreateProduct,
    @Inject(UPDATE_PRODUCT) private readonly updateProduct: UpdateProduct,
    @Inject(SET_PRODUCT_ACTIVE) private readonly setProductActive: SetProductActive,
  ) {}

  @Get()
  @RequirePermission('products.read')
  @ZodSerializerDto(SearchProductsResponseDto)
  async search(@Ctx() ctx: TenantContext, @Query() query: SearchProductsQueryDto) {
    return unwrapOrThrow(await this.searchProducts(ctx, query));
  }

  @Post()
  @RequirePermission('products.write')
  async create(@Ctx() ctx: TenantContext, @Body() body: CreateProductDto): Promise<Product> {
    return unwrapOrThrow(await this.createProduct(ctx, body));
  }

  @Get(':id')
  @RequirePermission('products.read')
  async get(@Ctx() ctx: TenantContext, @Param('id') id: string): Promise<Product> {
    return unwrapOrThrow(await this.getProduct(ctx, id));
  }

  @Patch(':id')
  @RequirePermission('products.write')
  async update(
    @Ctx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ): Promise<Product> {
    return unwrapOrThrow(await this.updateProduct(ctx, id, body));
  }

  @Post(':id/active')
  @HttpCode(200)
  @RequirePermission('products.write')
  async setActive(
    @Ctx() ctx: TenantContext,
    @Param('id') id: string,
    @Body() body: SetProductActiveDto,
  ): Promise<Product> {
    return unwrapOrThrow(await this.setProductActive(ctx, id, body.isActive));
  }
}
