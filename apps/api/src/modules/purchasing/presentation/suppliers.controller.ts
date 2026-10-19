import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_SUPPLIER } from '../application/create-supplier';
import type { CreateSupplier } from '../application/create-supplier';
import { LIST_SUPPLIERS } from '../application/list-suppliers';
import type { ListSuppliers } from '../application/list-suppliers';
import { parseId } from '../application/parse-id';
import { SET_SUPPLIER_ACTIVE } from '../application/set-supplier-active';
import type { SetSupplierActive } from '../application/set-supplier-active';
import { UPDATE_SUPPLIER } from '../application/update-supplier';
import type { UpdateSupplier } from '../application/update-supplier';
import type { Supplier } from '../application/views';
import {
  CreateSupplierRequestDto,
  ListSuppliersQueryDto,
  ListSuppliersResponseDto,
  SupplierDto,
  UpdateSupplierRequestDto,
} from './suppliers.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    @Inject(LIST_SUPPLIERS) private readonly listSuppliers: ListSuppliers,
    @Inject(CREATE_SUPPLIER) private readonly createSupplier: CreateSupplier,
    @Inject(UPDATE_SUPPLIER) private readonly updateSupplier: UpdateSupplier,
    @Inject(SET_SUPPLIER_ACTIVE) private readonly setSupplierActive: SetSupplierActive,
  ) {}

  @Get()
  @RequirePermission('purchases.create')
  @ZodSerializerDto(ListSuppliersResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Query() query: ListSuppliersQueryDto,
  ): Promise<{ items: readonly Supplier[] }> {
    return { items: unwrapOrThrow(await this.listSuppliers(ctx, query)) };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('suppliers.manage')
  @ZodSerializerDto(SupplierDto)
  async create(
    @Ctx() ctx: TenantContext,
    @Body() body: CreateSupplierRequestDto,
  ): Promise<Supplier> {
    return unwrapOrThrow(await this.createSupplier(ctx, body));
  }

  @Patch(':id')
  @RequirePermission('suppliers.manage')
  @ZodSerializerDto(SupplierDto)
  async update(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: UpdateSupplierRequestDto,
  ): Promise<Supplier> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return unwrapOrThrow(
      body.active === undefined
        ? await this.updateSupplier(ctx, id, body)
        : await this.setSupplierActive(ctx, id, body.active),
    );
  }
}
