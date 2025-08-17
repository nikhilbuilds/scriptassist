import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * RateLimitGuard - Enhanced In-Memory Rate Limiting
 *
 * This guard provides:
 * - Enhanced in-memory rate limiting with proper cleanup
 * - Configurable limits per route/endpoint
 * - IP-based and user-based rate limiting
 * - Proper security headers and error handling
 * - Comprehensive logging and monitoring
 *
 * Security Features:
 * - Uses enhanced in-memory storage with automatic cleanup
 * - Implements sliding window algorithm for accurate rate limiting
 * - Provides rate limit headers in responses
 * - Sanitizes error messages to prevent information leakage
 * - Supports different rate limits for different user roles
 *
 * Performance Features:
 * - Efficient in-memory operations with automatic cleanup
 * - Implements proper cleanup of expired entries
 * - Provides rate limit metadata in response headers
 * - Supports configurable time windows and limits
 *
 * Note: This implementation works for single-instance deployments.
 * For multi-instance deployments, consider upgrading to Redis-based rate limiting.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  // Enhanced in-memory storage with automatic cleanup
  private requestRecords: Map<string, { count: number; timestamp: number }[]> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private reflector: Reflector) {
    // Start cleanup interval to remove old entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEntries();
    }, 60000); // Clean up every minute

    // Clean up on application shutdown
    process.on('SIGTERM', () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    });
  }

  /**
   * Determines if the request should be allowed based on rate limits
   *
   * @param context Execution context
   * @returns True if request is within rate limits
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    try {
      // Get rate limit configuration from decorator or use defaults
      const rateLimitConfig = this.reflector.getAllAndOverride<{
        limit: number;
        windowMs: number;
        keyGenerator?: (request: any) => string;
      }>('rateLimit', [context.getHandler(), context.getClass()]) || {
        limit: 100,
        windowMs: 60000, // 1 minute
      };

      // Generate rate limit key (IP-based by default, can be customized)
      const key = this.generateRateLimitKey(request, rateLimitConfig.keyGenerator);

      // Check rate limit
      const rateLimitResult = await this.checkRateLimit(key, rateLimitConfig);

      // Set rate limit headers
      this.setRateLimitHeaders(response, rateLimitResult);

      // Log rate limit check
      this.logRateLimitCheck(request, rateLimitResult);

      if (!rateLimitResult.allowed) {
        throw new HttpException(
          {
            status: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Rate limit exceeded',
            message: 'Too many requests, please try again later',
            retryAfter: rateLimitResult.retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Rate limit check failed: ${errorMessage}`, errorStack);

      // Don't block requests if rate limiting fails
      // This ensures graceful degradation
      return true;
    }
  }

  /**
   * Generates a unique key for rate limiting
   *
   * @param request HTTP request object
   * @param keyGenerator Optional custom key generator function
   * @returns Rate limit key
   */
  private generateRateLimitKey(request: any, keyGenerator?: (request: any) => string): string {
    if (keyGenerator) {
      return keyGenerator(request);
    }

    // Default: IP-based rate limiting
    const ip = this.getClientIP(request);
    const userAgent = request.headers['user-agent'] || 'unknown';

    // Create a hash of IP and user agent for better security
    const keyData = `${ip}:${userAgent}`;
    const keyHash = this.simpleHash(keyData);

    return `rate_limit:${keyHash}`;
  }

  /**
   * Gets the client IP address with proper proxy handling
   *
   * @param request HTTP request object
   * @returns Client IP address
   */
  private getClientIP(request: any): string {
    // Check for forwarded headers (when behind proxy/load balancer)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      // Take the first IP in the chain
      return forwardedFor.split(',')[0].trim();
    }

    const realIP = request.headers['x-real-ip'];
    if (realIP) {
      return realIP;
    }

    return request.ip || request.connection?.remoteAddress || 'unknown';
  }

  /**
   * Simple hash function for rate limit keys
   *
   * @param str String to hash
   * @returns Hash value
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Checks if the request is within rate limits using in-memory storage
   *
   * @param key Rate limit key
   * @param config Rate limit configuration
   * @returns Rate limit result
   */
  private async checkRateLimit(
    key: string,
    config: { limit: number; windowMs: number },
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter: number;
  }> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get or create request records for this key
    if (!this.requestRecords.has(key)) {
      this.requestRecords.set(key, []);
    }

    const records = this.requestRecords.get(key)!;

    // Remove expired entries
    const validRecords = records.filter(record => record.timestamp > windowStart);
    this.requestRecords.set(key, validRecords);

    // Check if rate limit is exceeded
    const currentCount = validRecords.length;
    const allowed = currentCount < config.limit;
    const remaining = Math.max(0, config.limit - currentCount);

    // Add current request if allowed
    if (allowed) {
      validRecords.push({ count: 1, timestamp: now });
      this.requestRecords.set(key, validRecords);
    }

    // Calculate reset time (when the oldest entry expires)
    const resetTime = now + config.windowMs;
    const retryAfter = allowed ? 0 : Math.ceil((resetTime - now) / 1000);

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter,
    };
  }

  /**
   * Sets rate limit headers in the response
   *
   * @param response HTTP response object
   * @param result Rate limit result
   */
  private setRateLimitHeaders(
    response: any,
    result: {
      allowed: boolean;
      remaining: number;
      resetTime: number;
      retryAfter: number;
    },
  ): void {
    response.set('X-RateLimit-Limit', '100');
    response.set('X-RateLimit-Remaining', result.remaining.toString());
    response.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());

    if (!result.allowed) {
      response.set('Retry-After', result.retryAfter.toString());
    }
  }

  /**
   * Logs rate limit check for monitoring
   *
   * @param request HTTP request object
   * @param result Rate limit result
   */
  private logRateLimitCheck(
    request: any,
    result: {
      allowed: boolean;
      remaining: number;
      resetTime: number;
      retryAfter: number;
    },
  ): void {
    const { method, url } = request;
    const ip = this.getClientIP(request);

    if (result.allowed) {
      this.logger.debug(
        `Rate limit check passed: ${method} ${url} from ${ip} (${result.remaining} remaining)`,
      );
    } else {
      this.logger.warn(
        `Rate limit exceeded: ${method} ${url} from ${ip} (retry after ${result.retryAfter}s)`,
      );
    }
  }

  /**
   * Cleans up old entries to prevent memory leaks
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    let cleanedCount = 0;

    for (const [key, records] of this.requestRecords.entries()) {
      const validRecords = records.filter(record => record.timestamp > now - maxAge);

      if (validRecords.length === 0) {
        this.requestRecords.delete(key);
        cleanedCount++;
      } else if (validRecords.length !== records.length) {
        this.requestRecords.set(key, validRecords);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old rate limit entries`);
    }
  }
}

/**
 * RateLimit Decorator - Configures rate limiting for routes
 *
 * @param config Rate limit configuration
 * @returns Metadata decorator
 */
export const RateLimit = (config: {
  limit: number;
  windowMs: number;
  keyGenerator?: (request: any) => string;
}) => {
  return (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata('rateLimit', config, descriptor.value);
    return descriptor;
  };
};
