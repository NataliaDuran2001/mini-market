import { Module } from '@nestjs/common';
import { APP_VERSION } from '../../infrastructure/tokens';
import { GET_HEALTH, getHealth } from './application/get-health';
import { HealthController } from './presentation/health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: GET_HEALTH,
      useFactory: (version: string) => () => getHealth({ version }),
      inject: [APP_VERSION],
    },
  ],
})
export class HealthModule {}
