import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from '../services/rate-limiter.service';
import { RedisRateLimitGuard } from '../guards/redis-rate-limit.guard';
import { RateLimitInterceptor } from '../interceptors/rate-limit.interceptor';

@Global()
@Module({
  providers: [RateLimiterService, RedisRateLimitGuard, RateLimitInterceptor],
  exports: [RateLimiterService, RedisRateLimitGuard, RateLimitInterceptor],
})
export class RateLimiterModule {}
