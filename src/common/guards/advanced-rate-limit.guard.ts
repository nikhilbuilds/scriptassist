import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class AdvancedRateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: Request): string {
    // Use user ID if authenticated, otherwise use IP address
    const user = (req as any).user;
    if (user && user.id) {
      return `user:${user.id}`;
    }
    return `ip:${req.ip}`;
  }

  protected async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    
    // Get the tracker (user ID or IP)
    const tracker = this.getTracker(request);
    
    // Check if user is authenticated for stricter limits
    const user = (request as any).user;
    const isAuthenticated = !!user;
    
    // Apply different limits based on authentication status
    let effectiveLimit = limit;
    if (!isAuthenticated) {
      effectiveLimit = Math.floor(limit * 0.5); // Reduce limit for unauthenticated users
    }
    
    // Check rate limit
    const { totalHits, timeToExpire } = await this.storageService.increment(
      tracker,
      ttl,
    );
    
    // Add rate limit headers
    response.header('X-RateLimit-Limit', effectiveLimit.toString());
    response.header('X-RateLimit-Remaining', Math.max(0, effectiveLimit - totalHits).toString());
    response.header('X-RateLimit-Reset', new Date(Date.now() + timeToExpire * 1000).toISOString());
    
    if (totalHits > effectiveLimit) {
      throw new HttpException(
        {
          message: 'Rate limit exceeded',
          error: 'Too Many Requests',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          retryAfter: timeToExpire,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    
    return true;
  }
}
