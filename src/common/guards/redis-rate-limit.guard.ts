import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the request details
    const http = context.switchToHttp();
    const request = http?.getRequest<Request>();
    
    // Early exit if no request (shouldn't happen, but you never know)
    if (!request) {
      console.warn('⚠️  No request found in context - weird!');
      return true;
    }

    // Get rate limit config from decorators
    const handler = context.getHandler?.();
    const classHandler = context.getClass?.();
    
    const methodConfig = handler ? this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler) : undefined;
    const classConfig = classHandler ? this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, classHandler) : undefined;
    
    // Method config overrides class config
    const config = this.mergeConfigs(classConfig, methodConfig);

    if (!config) {
      return true; // No rate limiting for this endpoint
    }

    // Figure out who's making the request
    const identifier = this.getIdentifier(request, config);
    const endpoint = this.getEndpointKey(request, config);

    // Check if they're rate limited
    try {
      const result = await this.rateLimiterService.checkRateLimit(identifier, endpoint, config.strategy);
      
      if (!result.allowed) {
        // They're rate limited - show them the door
        this.setRateLimitHeaders(request, result);
        throw new UnauthorizedException('Slow down! Too many requests.');
      }
      
      // All good - let them through
      this.setRateLimitHeaders(request, result);
      return true;
      
    } catch (error) {
      // Redis might be down - log it but don't block the request
      console.error('🚨 Rate limiter failed:', error instanceof Error ? error.message : 'Unknown error');
      return true; // Fail open for now
    }
  }

  private getIdentifier(request: Partial<Request> | undefined, metadata?: RateLimitOptions): string {
    if (!metadata || metadata.identifier === 'user') {
      // Use user ID from JWT token if available
      const user = (request as any)?.user as { id?: string } | undefined;
      return user?.id || 'anonymous';
    }

    if (metadata.identifier === 'apikey') {
      // Use API key from headers
      return (request?.headers?.['x-api-key'] as string) || 'no-key';
    }

    // Default to IP address
    return this.getClientIp(request as any);
  }

  private getClientIp(request: Partial<Request> | undefined): string {
    const headers = (request as any)?.headers || {};
    const forwarded = headers['x-forwarded-for'];
    const realIp = headers['x-real-ip'];

    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }

    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    const ip = (request as any)?.ip;
    const connAddr = (request as any)?.connection?.remoteAddress;
    return ip || connAddr || 'unknown';
  }

  private getEndpointKey(request: Partial<Request> | undefined, metadata: RateLimitOptions): string | undefined {
    if (metadata.endpoint) {
      return metadata.endpoint;
    }

    // Generate endpoint key from route
    const route = (request as any)?.route?.path || (request as any)?.path;
    const method = String((request as any)?.method || '').toLowerCase();

    if (route && method) {
      return `${method}.${route.replace(/^\//, '').replace(/\//g, '.')}`;
    }

    return undefined;
  }

  private getWindowKey(identifier: string): string {
    const ts = Date.now();
    return `rate_limit:${identifier}:${ts}`;
  }

  private mergeConfigs(
    classConfig?: RateLimitOptions,
    methodConfig?: RateLimitOptions,
  ): RateLimitOptions | undefined {
    if (!classConfig && !methodConfig) {
      return undefined;
    }

    return {
      ...classConfig,
      ...methodConfig,
    };
  }

  private setRateLimitHeaders(
    request: Partial<Request> | undefined,
    result: { limit?: string; remaining: number; resetTime: number; retryAfter?: number },
  ): void {
    const response = (request as any)?.res as { set: (key: string, value: string | number) => void } | undefined;
    if (response) {
      response.set('X-RateLimit-Limit', result.limit || 'unknown');
      response.set('X-RateLimit-Remaining', result.remaining);
      response.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

      if (result.retryAfter && result.retryAfter > 0) {
        response.set('Retry-After', result.retryAfter);
      }
    }
  }
}
