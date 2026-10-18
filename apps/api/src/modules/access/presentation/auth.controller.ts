import { uuidSchema } from '@mini-market/contracts/common';
import { ValidationError } from '@mini-market/shared-kernel';
import { Body, Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { INVITE_MEMBER } from '../application/invite-member';
import type { InviteMember } from '../application/invite-member';
import type { AuthenticatedUser } from '../application/request-identity';
import { InviteMemberRequestDto, InviteMemberResponseDto } from './access.dto';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(@Inject(INVITE_MEMBER) private readonly inviteMember: InviteMember) {}

  @Post('invitations')
  @HttpCode(202)
  @ZodSerializerDto(InviteMemberResponseDto)
  async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Body() body: InviteMemberRequestDto,
  ) {
    const tenantId = uuidSchema.safeParse(tenantHeader);
    if (!tenantId.success) throw new ValidationError('X-Tenant-Id must be a UUID');
    const result = await this.inviteMember({ tenantId: tenantId.data, userId: user.userId }, body);
    if (!result.ok) throw result.error;
    return { ...result.value, expiresAt: result.value.expiresAt.toISOString() };
  }
}
