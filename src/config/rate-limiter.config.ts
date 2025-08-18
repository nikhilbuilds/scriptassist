import { registerAs } from '@nestjs/config';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  statusCode: number;
  headers: boolean;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface RateLimiterConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix: string;
    maxRetriesPerRequest: number;
    enableReadyCheck: boolean;
  };
  default: RateLimitConfig;
  endpoints: {
    [key: string]: RateLimitConfig;
  };
  strategies: {
    [key: string]: RateLimitConfig;
  };
}

export default registerAs(
  'rateLimiter',
  (): RateLimiterConfig => ({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: 'rate_limit:',
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    },
    default: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      statusCode: 429,
      headers: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    },
    endpoints: {
      'auth.login': {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 login attempts per 15 minutes
        message: 'Too many login attempts, please try again later.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: true,
        skipFailedRequests: false,
      },
      'auth.register': {
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // 3 registration attempts per hour
        message: 'Too many registration attempts, please try again later.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: true,
        skipFailedRequests: false,
      },
      'tasks.create': {
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 task creations per minute
        message: 'Too many task creation requests, please slow down.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      'tasks.batch': {
        windowMs: 60 * 1000, // 1 minute
        max: 5, // 5 batch operations per minute
        message: 'Too many batch operations, please slow down.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
    },
    strategies: {
      strict: {
        windowMs: 60 * 1000, // 1 minute
        max: 5, // 5 requests per minute
        message: 'Rate limit exceeded for strict endpoints.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      moderate: {
        windowMs: 60 * 1000, // 1 minute
        max: 30, // 30 requests per minute
        message: 'Rate limit exceeded for moderate endpoints.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
      relaxed: {
        windowMs: 60 * 1000, // 1 minute
        max: 100, // 100 requests per minute
        message: 'Rate limit exceeded for relaxed endpoints.',
        statusCode: 429,
        headers: true,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      },
    },
  }),
);
