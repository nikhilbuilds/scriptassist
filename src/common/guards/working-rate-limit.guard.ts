import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';

// Simple in-memory storage for rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();

@Injectable()
export class RateLimitGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = this.generateKey(request);
    const now = Date.now();
    const windowMs = 10 * 1000; // 10 seconds
    const limit = 3; // 3 requests per 10 seconds

    const current = requestCounts.get(key);
    
    if (!current || now > current.resetTime) {
      // First request or window expired
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      this.setHeaders(response, limit, limit - 1, now + windowMs);
      return true;
    }

    if (current.count >= limit) {
      // Rate limit exceeded
      this.setHeaders(response, limit, 0, current.resetTime);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too Many Requests',
          error: 'Rate limit exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Increment count
    current.count++;
    requestCounts.set(key, current);
    this.setHeaders(response, limit, limit - current.count, current.resetTime);
    
    return true;
  }

  private generateKey(request: Request): string {
    return `rate_limit:${request.ip}:${request.path}`;
  }

  private setHeaders(response: Response, limit: number, remaining: number, resetTime: number): void {
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    response.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
  }
}
