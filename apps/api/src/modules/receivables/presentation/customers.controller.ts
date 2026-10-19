import type {
  Customer as CustomerResponse,
  CustomerStatement,
  ListCustomersResponse,
  RegisterCollectionResponse,
} from '@mini-market/contracts/receivables';
import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { Ctx, RequirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { CREATE_CUSTOMER } from '../application/create-customer';
import type { CreateCustomer } from '../application/create-customer';
import { GET_CUSTOMER_STATEMENT } from '../application/get-customer-statement';
import type { GetCustomerStatement } from '../application/get-customer-statement';
import { parseId } from '../application/parse-id';
import { REGISTER_COLLECTION } from '../application/register-collection';
import type { RegisterCollection } from '../application/register-collection';
import { SEARCH_CUSTOMERS } from '../application/search-customers';
import type { SearchCustomers } from '../application/search-customers';
import { UPDATE_CUSTOMER } from '../application/update-customer';
import type { UpdateCustomer } from '../application/update-customer';
import {
  CreateCustomerRequestDto,
  CustomerDto,
  CustomerStatementDto,
  ListCustomersQueryDto,
  ListCustomersResponseDto,
  RegisterCollectionRequestDto,
  RegisterCollectionResponseDto,
  UpdateCustomerRequestDto,
} from './customers.dto';
import { toCollectionDto, toCustomerDto, toStatementDto } from './customers.mapper';

@Controller('customers')
export class CustomersController {
  constructor(
    @Inject(SEARCH_CUSTOMERS) private readonly searchCustomers: SearchCustomers,
    @Inject(CREATE_CUSTOMER) private readonly createCustomer: CreateCustomer,
    @Inject(UPDATE_CUSTOMER) private readonly updateCustomer: UpdateCustomer,
    @Inject(GET_CUSTOMER_STATEMENT) private readonly getStatement: GetCustomerStatement,
    @Inject(REGISTER_COLLECTION) private readonly registerCollection: RegisterCollection,
  ) {}

  @Get()
  @RequirePermission('receivables.read')
  @ZodSerializerDto(ListCustomersResponseDto)
  async list(
    @Ctx() ctx: TenantContext,
    @Query() query: ListCustomersQueryDto,
  ): Promise<ListCustomersResponse> {
    const customers = unwrapOrThrow(await this.searchCustomers(ctx, query));
    return { items: customers.map(toCustomerDto) };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('receivables.collect')
  @ZodSerializerDto(CustomerDto)
  async create(
    @Ctx() ctx: TenantContext,
    @Body() body: CreateCustomerRequestDto,
  ): Promise<CustomerResponse> {
    return toCustomerDto(unwrapOrThrow(await this.createCustomer(ctx, body)));
  }

  @Patch(':id')
  @RequirePermission('receivables.collect')
  @ZodSerializerDto(CustomerDto)
  async update(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: UpdateCustomerRequestDto,
  ): Promise<CustomerResponse> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toCustomerDto(unwrapOrThrow(await this.updateCustomer(ctx, id, body)));
  }

  @Get(':id/statement')
  @RequirePermission('receivables.read')
  @ZodSerializerDto(CustomerStatementDto)
  async statement(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
  ): Promise<CustomerStatement> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toStatementDto(unwrapOrThrow(await this.getStatement(ctx, id)));
  }

  @Post(':id/collections')
  @HttpCode(201)
  @RequirePermission('receivables.collect')
  @ZodSerializerDto(RegisterCollectionResponseDto)
  async collect(
    @Ctx() ctx: TenantContext,
    @Param('id') idParam: string,
    @Body() body: RegisterCollectionRequestDto,
  ): Promise<RegisterCollectionResponse> {
    const id = unwrapOrThrow(parseId(idParam, 'id'));
    return toCollectionDto(unwrapOrThrow(await this.registerCollection(ctx, id, body)));
  }
}
