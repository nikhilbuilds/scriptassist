import { Module } from '@nestjs/common';
import { SimpleHealthController } from '../controllers/simple-health.controller';

@Module({
  controllers: [SimpleHealthController],
})
export class SimpleObservabilityModule {}
