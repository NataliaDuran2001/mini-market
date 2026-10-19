import {
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  listInvitationsResponseSchema,
  listMembersResponseSchema,
  meResponseSchema,
  memberSchema,
  myTenantsResponseSchema,
  updateMemberRequestSchema,
} from '@mini-market/contracts/access';
import { createZodDto } from 'nestjs-zod';

export class MeResponseDto extends createZodDto(meResponseSchema) {}
export class MyTenantsResponseDto extends createZodDto(myTenantsResponseSchema) {}
export class InviteMemberRequestDto extends createZodDto(inviteMemberRequestSchema) {}
export class InviteMemberResponseDto extends createZodDto(inviteMemberResponseSchema) {}
export class AcceptInvitationRequestDto extends createZodDto(acceptInvitationRequestSchema) {}
export class AcceptInvitationResponseDto extends createZodDto(acceptInvitationResponseSchema) {}
export class ListInvitationsResponseDto extends createZodDto(listInvitationsResponseSchema) {}
export class MemberDtoextends createZodDto(memberSchema) {}
export class ListMembersResponseDto extends createZodDto(listMembersResponseSchema) {}
export class UpdateMemberRequestDto extends createZodDto(updateMemberRequestSchema) {}
