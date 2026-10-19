import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { ACCEPT_INVITATION } from '../application/accept-invitation';
import type { Accepted, AcceptInvitation } from '../application/accept-invitation';
import { LIST_INVITATIONS } from '../application/list-invitations';
import type { ListInvitations } from '../application/list-invitations';
import type { AuthenticatedUser } from '../application/request-identity';
import type { TenantContext } from '../application/views';
import {
  AcceptInvitationRequestDto,
  AcceptInvitationResponseDto,
  ListInvitationsResponseDto,
} from './access.dto';
import { CurrentUser } from './current-user.decorator';
import { Ctx, RequirePermission, WithoutTenant } from './route-decorators';

@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject(ACCEPT_INVITATION) private readonly acceptInvitation: AcceptInvitation,
    @Inject(LIST_INVITATIONS) private readonly listInvitations: ListInvitations,
  ) {}

  /** Open invitations of the tenant of the owner, newest first. Never carries a token or hash. */
  @Get()
  @RequirePermission('members.manage')
  @ZodSerializerDto(ListInvitationsResponseDto)
  async list(@Ctx() ctx: TenantContext) {
    const items = unwrapOrThrow(await this.listInvitations(ctx));
    return {
      items: items.map((item) => ({
        ...item,
        invitedAt: item.invitedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
    };
  }

  /** The invitee has no membership yet, so no tenant header: the token names the tenant. */
  @Post('accept')
  @WithoutTenant()
  @HttpCode(200)
  @ZodSerializerDto(AcceptInvitationResponseDto)
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AcceptInvitationRequestDto,
  ): Promise<Accepted> {
    return unwrapOrThrow(await this.acceptInvitation(user, body.token));
  }
}
