import { Controller, Get, Inject } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { LIST_MY_TENANTS } from '../application/list-my-tenants';
import type { ListMyTenants } from '../application/list-my-tenants';
import type { AuthenticatedUser } from '../application/request-identity';
import type { MyTenant } from '../application/views';
import { MeResponseDto, MyTenantsResponseDto } from './access.dto';
import { CurrentUser } from './current-user.decorator';
import { WithoutTenant } from './route-decorators';

/** The routes of the signed-in person, before any business is chosen: no `X-Tenant-Id`. */
@WithoutTenant()
@Controller('me')
export class MeController {
  constructor(@Inject(LIST_MY_TENANTS) private readonly listMyTenants: ListMyTenants) {}

  @Get()
  @ZodSerializerDto(MeResponseDto)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('tenants')
  @ZodSerializerDto(MyTenantsResponseDto)
  async tenants(@CurrentUser() user: AuthenticatedUser): Promise<{ items: readonly MyTenant[] }> {
    return { items: await this.listMyTenants(user) };
  }
}
