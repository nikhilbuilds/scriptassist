import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
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
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const classHandler = context.getClass();

    // Get rate limit metadata from method and class
    const methodMetadata = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler);
    const classMetadata = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, classHandler);

    // Merge metadata (method takes precedence over class)
    const metadata = this.mergeConfigs(classMetadata, methodMetadata);

    if (!metadata) {
      return true; // No rate limiting configured
    }

    const identifier = this.getIdentifier(request, metadata);
    const endpoint = this.getEndpointKey(request, metadata);
    const strategy = metadata.strategy;

    const result = await this.rateLimiterService.checkRateLimit(identifier, endpoint, strategy);

    if (!result.allowed) {
      this.setRateLimitHeaders(request, result);
      throw new HttpException(
        'Too many requests, please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.setRateLimitHeaders(request, result);
    return true;
  }

  private getIdentifier(request: Request, metadata: RateLimitOptions): string {
    if (metadata.identifier === 'user') {
      // Use user ID from JWT token if available
      const user = (request as { user?: { id: string } }).user;
      return user?.id || 'anonymous';
    }

    if (metadata.identifier === 'apikey') {
      // Use API key from headers
      return (request.headers['x-api-key'] as string) || 'no-key';
    }

    // Default to IP address
    return this.getClientIp(request);
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];

    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    }

    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    return request.ip || request.connection.remoteAddress || 'unknown';
  }

  private getEndpointKey(request: Request, metadata: RateLimitOptions): string | undefined {
    if (metadata.endpoint) {
      return metadata.endpoint;
    }

    // Generate endpoint key from route
    const route = request.route?.path || request.path;
    const method = request.method.toLowerCase();

    if (route && method) {
      return `${method}.${route.replace(/^\//, '').replace(/\//g, '.')}`;
    }

    return undefined;
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
    request: Request,
    result: { limit?: string; remaining: number; resetTime: number; retryAfter?: number },
  ): void {
    const response = (request as { res?: { set: (key: string, value: string | number) => void } })
      .res;
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
