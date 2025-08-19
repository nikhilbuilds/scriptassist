import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RateLimiterService } from '../services/rate-limiter.service';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    const classHandler = context.getClass();

    // Get rate limit metadata
    const methodMetadata = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler);
    const classMetadata = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, classHandler);

    const metadata = this.mergeConfigs(classMetadata, methodMetadata);

    if (!metadata) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: _response => {
          // Handle successful requests
          if (metadata.skipSuccessfulRequests) {
            this.handleSuccessfulRequest(request, metadata);
          }
        },
        error: _error => {
          // Handle failed requests
          if (metadata.skipFailedRequests) {
            this.handleFailedRequest(request, metadata);
          }
        },
      }),
    );
  }

  private handleSuccessfulRequest(request: any, metadata: RateLimitOptions): void {
    // Logic for handling successful requests
    // This could involve resetting rate limits or logging
    console.log('Rate limit: Successful request handled', {
      path: request.path,
      method: request.method,
      metadata,
    });
  }

  private handleFailedRequest(request: any, metadata: RateLimitOptions): void {
    // Logic for handling failed requests
    // This could involve adjusting rate limits or logging
    console.log('Rate limit: Failed request handled', {
      path: request.path,
      method: request.method,
      metadata,
    });
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
}
