import { unwrapOrThrow } from '@mini-market/shared-kernel';
import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { CHANGE_MEMBER_ROLE } from '../application/change-member-role';
import type { ChangeMemberRole } from '../application/change-member-role';
import { DISABLE_MEMBER } from '../application/disable-member';
import type { DisableMember } from '../application/disable-member';
import { ENABLE_MEMBER } from '../application/enable-member';
import type { EnableMember } from '../application/enable-member';
import { LIST_MEMBERS } from '../application/list-members';
import type { ListMembers } from '../application/list-members';
import { parseUuid } from '../application/parse-uuid';
import type { Member, TenantContext } from '../application/views';
import { ListMembersResponseDto, MemberDto, UpdateMemberRequestDto } from './access.dto';
import { Ctx, RequirePermission } from './route-decorators';

@Controller('members')
export class MembersController {
  constructor(
    @Inject(LIST_MEMBERS) private readonly listMembers: ListMembers,
    @Inject(CHANGE_MEMBER_ROLE) private readonly changeMemberRole: ChangeMemberRole,
    @Inject(DISABLE_MEMBER) private readonly disableMember: DisableMember,
    @Inject(ENABLE_MEMBER) private readonly enableMember: EnableMember,
  ) {}

  @Get()
  @RequirePermission('members.manage')
  @ZodSerializerDto(ListMembersResponseDto)
  async list(@Ctx() ctx: TenantContext): Promise<{ items: readonly Member[] }> {
    return { items: unwrapOrThrow(await this.listMembers(ctx)) };
  }

  @Patch(':userId')
  @RequirePermission('members.manage')
  @ZodSerializerDto(MemberDto)
  async update(
    @Ctx() ctx: TenantContext,
    @Param('userId') userIdParam: string,
    @Body() body: UpdateMemberRequestDto,
  ): Promise<Member> {
    const userId = unwrapOrThrow(parseUuid(userIdParam, 'userId'));
    if (body.role !== undefined) {
      return unwrapOrThrow(await this.changeMemberRole(ctx, { userId, role: body.role }));
    }
    return unwrapOrThrow(
      body.status === 'active'
        ? await this.enableMember(ctx, { userId })
        : await this.disableMember(ctx, { userId }),
    );
  }
}
