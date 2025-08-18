import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  endpoint?: string;
  strategy?: string;
  identifier?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export const RateLimit = (options: RateLimitOptions = {}) => SetMetadata(RATE_LIMIT_KEY, options);

export const RateLimitByIP = (options: Omit<RateLimitOptions, 'identifier'> = {}) =>
  SetMetadata(RATE_LIMIT_KEY, { ...options, identifier: 'ip' });

export const RateLimitByUser = (options: Omit<RateLimitOptions, 'identifier'> = {}) =>
  SetMetadata(RATE_LIMIT_KEY, { ...options, identifier: 'user' });

export const RateLimitByApiKey = (options: Omit<RateLimitOptions, 'identifier'> = {}) =>
  SetMetadata(RATE_LIMIT_KEY, { ...options, identifier: 'apikey' });

export const StrictRateLimit = () => SetMetadata(RATE_LIMIT_KEY, { strategy: 'strict' });

export const ModerateRateLimit = () => SetMetadata(RATE_LIMIT_KEY, { strategy: 'moderate' });

export const RelaxedRateLimit = () => SetMetadata(RATE_LIMIT_KEY, { strategy: 'relaxed' });

export const SkipRateLimitOnSuccess = () =>
  SetMetadata(RATE_LIMIT_KEY, { skipSuccessfulRequests: true });

export const SkipRateLimitOnFailure = () =>
  SetMetadata(RATE_LIMIT_KEY, { skipFailedRequests: true });

// Predefined rate limit configurations for common scenarios
export const RateLimits = {
  Auth: {
    Login: () => RateLimit({ endpoint: 'auth.login' }),
    Register: () => RateLimit({ endpoint: 'auth.register' }),
    Refresh: () => RateLimit({ strategy: 'moderate' }),
  },
  Tasks: {
    Create: () => RateLimit({ endpoint: 'tasks.create' }),
    List: () => RateLimit({ strategy: 'moderate' }),
    Update: () => RateLimit({ strategy: 'moderate' }),
    Delete: () => RateLimit({ strategy: 'moderate' }),
    Batch: () => RateLimit({ endpoint: 'tasks.batch' }),
  },
  Users: {
    Update: () => RateLimit({ strategy: 'moderate' }),
    List: () => RateLimit({ strategy: 'moderate' }),
    Profile: () => RateLimit({ strategy: 'moderate' }),
  },
};
