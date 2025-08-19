import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { CacheModule } from 'src/cache/cache.module';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    CacheModule,
    TerminusModule.forRoot({ errorLogStyle: 'json' }),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
