import {
  inviteMemberRequestSchema,
  inviteMemberResponseSchema,
  meResponseSchema,
} from '@mini-market/contracts/access';
import { createZodDto } from 'nestjs-zod';

export class MeResponseDto extends createZodDto(meResponseSchema) {}
export class InviteMemberRequestDto extends createZodDto(inviteMemberRequestSchema) {}
export class InviteMemberResponseDto extends createZodDto(inviteMemberResponseSchema) {}
