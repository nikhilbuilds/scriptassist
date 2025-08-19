import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimiterConfig, RateLimitConfig } from '../../config/rate-limiter.config';

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private redis: Redis;
  private config: RateLimiterConfig;

  constructor(private configService: ConfigService) {
    const config = this.configService.get<RateLimiterConfig>('rateLimiter');
    if (!config) {
      throw new Error('Rate limiter configuration not found');
    }
    this.config = config;

    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      keyPrefix: this.config.redis.keyPrefix,
      maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
      enableReadyCheck: this.config.redis.enableReadyCheck,
      lazyConnect: true,
    });
  }

  async checkRateLimit(
    identifier: string,
    endpoint?: string,
    strategy?: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter: number;
  }> {
    const config = this.getConfig(endpoint, strategy);
    const key = this.generateKey(identifier, endpoint, strategy);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current entries in the window
      pipeline.zcard(key);

      // Add current request timestamp
      pipeline.zadd(key, now, `${now}-${Math.random()}`);

      // Set expiration on the key
      pipeline.expire(key, Math.ceil(config.windowMs / 1000));

      const results = await pipeline.exec();

      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      const currentCount = results[1][1] as number;
      const allowed = currentCount < config.max;
      const remaining = Math.max(0, config.max - currentCount);
      const resetTime = now + config.windowMs;
      const retryAfter = allowed ? 0 : Math.ceil((resetTime - now) / 1000);

      return {
        allowed,
        remaining,
        resetTime,
        retryAfter,
      };
    } catch (error) {
      // If Redis is unavailable, allow the request (graceful degradation)
      console.error('Rate limiter Redis error:', error);
      return {
        allowed: true,
        remaining: config.max,
        resetTime: now + config.windowMs,
        retryAfter: 0,
      };
    }
  }

  private getConfig(endpoint?: string, strategy?: string): RateLimitConfig {
    if (endpoint && this.config.endpoints[endpoint]) {
      return this.config.endpoints[endpoint];
    }

    if (strategy && this.config.strategies[strategy]) {
      return this.config.strategies[strategy];
    }

    return this.config.default;
  }

  private generateKey(identifier: string, endpoint?: string, strategy?: string): string {
    const parts = [identifier];

    if (endpoint) {
      parts.push(endpoint);
    }

    if (strategy) {
      parts.push(strategy);
    }

    return parts.join(':');
  }

  async getEndpointConfig(endpoint: string): Promise<RateLimitConfig | null> {
    return this.config.endpoints[endpoint] || null;
  }

  async getStrategyConfig(strategy: string): Promise<RateLimitConfig | null> {
    return this.config.strategies[strategy] || null;
  }

  async resetRateLimit(identifier: string, endpoint?: string, strategy?: string): Promise<void> {
    const key = this.generateKey(identifier, endpoint, strategy);
    await this.redis.del(key);
  }

  async getRateLimitInfo(
    identifier: string,
    endpoint?: string,
    strategy?: string,
  ): Promise<{
    current: number;
    limit: number;
    remaining: number;
    resetTime: number;
  }> {
    const config = this.getConfig(endpoint, strategy);
    const key = this.generateKey(identifier, endpoint, strategy);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Remove old entries and count current ones
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const current = await this.redis.zcard(key);

      return {
        current,
        limit: config.max,
        remaining: Math.max(0, config.max - current),
        resetTime: now + config.windowMs,
      };
    } catch (error) {
      console.error('Error getting rate limit info:', error);
      return {
        current: 0,
        limit: config.max,
        remaining: config.max,
        resetTime: now + config.windowMs,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('Rate limiter health check failed:', error);
      return false;
    }
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}
