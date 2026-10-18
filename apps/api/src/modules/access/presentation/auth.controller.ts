import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { INVITE_MEMBER } from '../application/invite-member';
import type { InviteMember } from '../application/invite-member';
import type { TenantContext } from '../application/views';
import { InviteMemberRequestDto, InviteMemberResponseDto } from './access.dto';
import { Ctx, RequirePermission } from './route-decorators';

@Controller('auth')
export class AuthController {
  constructor(@Inject(INVITE_MEMBER) private readonly inviteMember: InviteMember) {}

  @Post('invitations')
  @HttpCode(202)
  @RequirePermission('members.manage')
  @ZodSerializerDto(InviteMemberResponseDto)
  async invite(@Ctx() ctx: TenantContext, @Body() body: InviteMemberRequestDto) {
    const receipt = unwrapOrThrow(await this.inviteMember(ctx, body));
    return { ...receipt, expiresAt: receipt.expiresAt.toISOString() };
  }
}
