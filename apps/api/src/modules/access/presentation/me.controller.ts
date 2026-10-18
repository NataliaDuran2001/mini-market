import { Controller, Get } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import type { AuthenticatedUser } from '../application/request-identity';
import { MeResponseDto } from './access.dto';
import { CurrentUser } from './current-user.decorator';

@Controller('me')
export class MeController {
  @Get()
  @ZodSerializerDto(MeResponseDto)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
