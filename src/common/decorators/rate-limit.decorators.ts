import { SetMetadata } from '@nestjs/common';
import { RateLimitConfig } from '../guards/secure-rate-limit.guard';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (config: RateLimitConfig) => SetMetadata(RATE_LIMIT_KEY, config);

// Predefined rate limit configurations
export const StrictRateLimit = () => RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
});

export const StandardRateLimit = () => RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
});

export const RelaxedRateLimit = () => RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 500,
});

export const AuthRateLimit = () => RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // Strict limit for authentication endpoints
});

export const ApiRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30,
});

export const FileUploadRateLimit = () => RateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
});

export const SearchRateLimit = () => RateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
});

export const ReportRateLimit = () => RateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 5,
});

// Custom rate limit configurations for specific use cases
export const CustomRateLimit = (windowMs: number, maxRequests: number) => 
  RateLimit({ windowMs, maxRequests });

export const PerUserRateLimit = (maxRequests: number) => RateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests,
  keyGenerator: (request) => {
    const userId = (request as any).user?.userId || 'anonymous';
    return `rate_limit:user:${userId}`;
  },
});

export const PerIpRateLimit = (maxRequests: number) => RateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests,
  keyGenerator: (request) => {
    const ip = request.ip || request.connection.remoteAddress || 'unknown';
    return `rate_limit:ip:${ip}`;
  },
});

export const PerEndpointRateLimit = (maxRequests: number) => RateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests,
  keyGenerator: (request) => {
    const endpoint = `${request.method}:${request.route?.path || request.url}`;
    const userId = (request as any).user?.userId || 'anonymous';
    return `rate_limit:endpoint:${endpoint}:${userId}`;
  },
});
