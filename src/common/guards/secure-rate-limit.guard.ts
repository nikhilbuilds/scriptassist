import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RedisCacheService } from '../services/redis-cache.service';

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Skip rate limiting for successful requests
  skipFailedRequests?: boolean; // Skip rate limiting for failed requests
  keyGenerator?: (request: Request) => string; // Custom key generator
  handler?: (request: Request, response: any) => void; // Custom handler for rate limit exceeded
}

@Injectable()
export class SecureRateLimitGuard implements CanActivate {
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  };

  constructor(
    private reflector: Reflector,
    private cacheService: RedisCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    
    // Get rate limit configuration from decorator or use default
    const config = this.getRateLimitConfig(context) || this.defaultConfig;
    
    // Generate rate limit key
    const key = this.generateKey(request, config);
    
    // Check if rate limit is exceeded
    const isExceeded = await this.checkRateLimit(key, config);
    
    if (isExceeded) {
      // Get remaining time and requests
      const remainingTime = await this.getRemainingTime(key, config.windowMs);
      const remainingRequests = await this.getRemainingRequests(key, config.maxRequests);
      
      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', config.maxRequests);
      response.setHeader('X-RateLimit-Remaining', Math.max(0, remainingRequests));
      response.setHeader('X-RateLimit-Reset', new Date(Date.now() + remainingTime).toISOString());
      response.setHeader('Retry-After', Math.ceil(remainingTime / 1000));
      
      // Call custom handler if provided
      if (config.handler) {
        config.handler(request, response);
      }
      
      throw new ForbiddenException({
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil(remainingTime / 1000),
        remainingRequests: Math.max(0, remainingRequests),
      });
    }
    
    // Increment request count
    await this.incrementRequestCount(key, config.windowMs);
    
    // Set rate limit headers for successful requests
    const currentCount = await this.getCurrentCount(key);
    response.setHeader('X-RateLimit-Limit', config.maxRequests);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - currentCount));
    response.setHeader('X-RateLimit-Reset', new Date(Date.now() + config.windowMs).toISOString());
    
    return true;
  }

  private getRateLimitConfig(context: ExecutionContext): RateLimitConfig | null {
    return this.reflector.getAllAndOverride<RateLimitConfig>('rateLimit', [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private generateKey(request: Request, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(request);
    }

    // Default key generation based on IP and user agent
    const ip = this.getClientIp(request);
    const userAgent = request.headers['user-agent'] || 'unknown';
    const userId = (request as any).user?.userId || 'anonymous';
    
    // Create a hash of the key components
    const crypto = require('crypto');
    const keyString = `${ip}:${userAgent}:${userId}`;
    return `rate_limit:${crypto.createHash('sha256').update(keyString).digest('hex')}`;
  }

  private getClientIp(request: Request): string {
    // Check for forwarded headers (for proxy/load balancer scenarios)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      return (forwardedFor as string).split(',')[0].trim();
    }
    
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return realIp as string;
    }
    
    return request.ip || request.connection.remoteAddress || 'unknown';
  }

  private async checkRateLimit(key: string, config: RateLimitConfig): Promise<boolean> {
    const currentCount = await this.getCurrentCount(key);
    return currentCount >= config.maxRequests;
  }

  private async getCurrentCount(key: string): Promise<number> {
    const count = await this.cacheService.get<number>(key);
    return count || 0;
  }

  private async incrementRequestCount(key: string, windowMs: number): Promise<void> {
    await this.cacheService.increment(key, 1, { ttl: Math.ceil(windowMs / 1000) });
  }

  private async getRemainingTime(key: string, windowMs: number): Promise<number> {
    const ttl = await this.cacheService.getTTL(key);
    return ttl > 0 ? ttl * 1000 : windowMs;
  }

  private async getRemainingRequests(key: string, maxRequests: number): Promise<number> {
    const currentCount = await this.getCurrentCount(key);
    return Math.max(0, maxRequests - currentCount);
  }

  // Utility methods for advanced rate limiting scenarios
  async getRateLimitInfo(key: string, config: RateLimitConfig): Promise<{
    current: number;
    remaining: number;
    reset: Date;
    limit: number;
  }> {
    const current = await this.getCurrentCount(key);
    const remaining = Math.max(0, config.maxRequests - current);
    const reset = new Date(Date.now() + config.windowMs);
    
    return {
      current,
      remaining,
      reset,
      limit: config.maxRequests,
    };
  }

  async resetRateLimit(key: string): Promise<void> {
    await this.cacheService.delete(key);
  }

  async setRateLimit(key: string, count: number, windowMs: number): Promise<void> {
    await this.cacheService.set(key, count, { ttl: Math.ceil(windowMs / 1000) });
  }
}
