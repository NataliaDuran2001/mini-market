import { Controller, Get, Inject } from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { GET_HEALTH } from '../application/get-health';
import type { GetHealth, HealthStatus } from '../application/get-health';
import { HealthResponseDto } from './health.dto';

@Controller('health')
export class HealthController {
  constructor(@Inject(GET_HEALTH) private readonly getHealth: GetHealth) {}

  @Get()
  @ZodSerializerDto(HealthResponseDto)
  check(): HealthStatus {
    return this.getHealth();
  }
}
