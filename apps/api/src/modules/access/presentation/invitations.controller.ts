import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { ACCEPT_INVITATION } from '../application/accept-invitation';
import type { Accepted, AcceptInvitation } from '../application/accept-invitation';
import type { AuthenticatedUser } from '../application/request-identity';
import { AcceptInvitationRequestDto, AcceptInvitationResponseDto } from './access.dto';
import { CurrentUser } from './current-user.decorator';
import { WithoutTenant } from './route-decorators';

@Controller('invitations')
export class InvitationsController {
  constructor(@Inject(ACCEPT_INVITATION) private readonly acceptInvitation: AcceptInvitation) {}

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
