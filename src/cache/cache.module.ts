import { Module } from '@nestjs/common';

import { CacheService } from './cache.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
