# Redis-Based Rate Limiter Implementation

This document describes the implementation of a comprehensive Redis-based rate limiting system for the NestJS application, following the approach outlined in the reference article.

## Overview

The rate limiter provides:
- **Sliding Window Algorithm**: More accurate than fixed windows
- **Redis-based Storage**: Distributed and scalable
- **Flexible Configuration**: Per-endpoint and strategy-based limits
- **Graceful Degradation**: Continues working if Redis is unavailable
- **Multiple Identifier Types**: IP, User ID, API Key support
- **Comprehensive Headers**: Standard rate limit headers

## Architecture

### Components

1. **RateLimiterService** (`src/common/services/rate-limiter.service.ts`)
   - Core rate limiting logic using Redis sorted sets
   - Sliding window implementation
   - Graceful degradation handling

2. **RedisRateLimitGuard** (`src/common/guards/redis-rate-limit.guard.ts`)
   - NestJS guard for applying rate limits
   - Metadata-based configuration
   - Header management

3. **Rate Limit Decorators** (`src/common/decorators/rate-limit.decorator.ts`)
   - Easy-to-use decorators for controllers
   - Predefined configurations for common scenarios
   - Flexible customization options

4. **Rate Limiter Configuration** (`src/config/rate-limiter.config.ts`)
   - Centralized configuration management
   - Environment-based settings
   - Endpoint and strategy-specific rules

5. **Rate Limiter Module** (`src/common/modules/rate-limiter.module.ts`)
   - Global module for dependency injection
   - Service and guard registration

## Configuration

### Redis Settings
```typescript
redis: {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6380', 10),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: 'rate_limit:',
  // ... other Redis options
}
```

### Default Limits
```typescript
default: {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests from this IP, please try again later.',
  statusCode: 429,
  headers: true,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
}
```

### Endpoint-Specific Limits
```typescript
endpoints: {
  'auth.login': {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    skipSuccessfulRequests: true, // Don't count successful logins
  },
  'auth.register': {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registration attempts per hour
  },
  'tasks.create': {
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 task creations per minute
  },
  'tasks.batch': {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 batch operations per minute
  },
}
```

### Strategy-Based Limits
```typescript
strategies: {
  'strict': {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
  },
  'moderate': {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
  },
  'relaxed': {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
}
```

## Usage

### Basic Decorators

```typescript
import { RateLimits } from '../common/decorators/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  @Post('login')
  @RateLimits.Auth.Login() // 5 attempts per 15 minutes
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @RateLimits.Auth.Register() // 3 attempts per hour
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }
}
```

### Custom Configuration

```typescript
@Post('sensitive-operation')
@RateLimit({
  endpoint: 'custom.endpoint',
  strategy: 'strict',
  identifier: 'user', // Rate limit by user ID instead of IP
})
sensitiveOperation() {
  // Implementation
}
```

### Strategy-Based Limits

```typescript
@Get('public-data')
@RelaxedRateLimit() // 100 requests per minute
getPublicData() {
  // Implementation
}

@Post('admin-action')
@StrictRateLimit() // 5 requests per minute
adminAction() {
  // Implementation
}
```

## Implementation Details

### Sliding Window Algorithm

The rate limiter uses Redis sorted sets to implement a sliding window:

1. **Key Structure**: `rate_limit:{identifier}:{endpoint}`
2. **Score**: Timestamp of the request
3. **Member**: Unique request identifier
4. **Window Management**: Remove old entries outside the window
5. **Atomic Operations**: Use Redis pipeline for consistency

### Redis Commands Used

```typescript
// Remove old entries outside the window
await redis.zremrangebyscore(key, 0, windowStart);

// Count current entries in the window
const currentCount = await redis.zcard(key);

// Add current request timestamp
await redis.zadd(key, now, `${now}-${Math.random()}`);

// Set expiration on the key
await redis.expire(key, Math.ceil(windowMs / 1000));
```

### Graceful Degradation

If Redis is unavailable, the rate limiter:
- Logs the error
- Allows the request to proceed
- Returns default rate limit info
- Maintains application functionality

### Header Management

The rate limiter sets standard headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in the window
- `X-RateLimit-Reset`: Window reset time
- `Retry-After`: Seconds to wait when rate limited

## Testing

### Manual Testing

```bash
# Test login rate limiting (5 attempts per 15 minutes)
for i in {1..6}; do
  curl -s -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin123"}' \
    http://localhost:3000/auth/login -i | grep -E "(HTTP|X-RateLimit|429)"
done

# Test registration rate limiting (3 attempts per hour)
for i in {1..4}; do
  curl -s -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@example.com\",\"password\":\"password123\",\"name\":\"Test User $i\"}" \
    http://localhost:3000/auth/register -i | grep -E "(HTTP|X-RateLimit|429)"
done
```

### Expected Behavior

1. **First 5 login attempts**: 201 Created with decreasing `X-RateLimit-Remaining`
2. **6th login attempt**: 429 Too Many Requests with `X-RateLimit-Remaining: 0`
3. **Registration attempts**: Similar pattern with 3 attempts limit

## Performance Considerations

### Redis Optimization
- Uses Redis pipeline for atomic operations
- Sets appropriate key expiration
- Uses sorted sets for efficient range queries
- Implements lazy connection for better startup performance

### Memory Management
- Automatic cleanup of expired entries
- Key expiration prevents memory leaks
- Efficient data structures minimize memory usage

### Scalability
- Distributed rate limiting across multiple instances
- Redis cluster support for high availability
- Horizontal scaling capability

## Security Features

### Identifier Flexibility
- **IP-based**: Default for most endpoints
- **User-based**: For authenticated endpoints
- **API Key-based**: For API access control

### Configuration Security
- Environment-based configuration
- No hardcoded secrets
- Flexible per-endpoint limits

### Error Handling
- Graceful degradation on Redis failure
- Proper error logging
- No sensitive information exposure

## Monitoring and Observability

### Health Checks
```typescript
// Check Redis connectivity
const isHealthy = await rateLimiterService.healthCheck();
```

### Rate Limit Information
```typescript
// Get current rate limit status
const info = await rateLimiterService.getRateLimitInfo(
  identifier,
  endpoint,
  strategy
);
```

### Logging
- Rate limit violations are logged
- Redis connection issues are logged
- Configuration errors are logged

## Best Practices

### Configuration
1. Set appropriate limits for each endpoint
2. Use different strategies for different sensitivity levels
3. Configure Redis connection properly
4. Set up monitoring and alerting

### Implementation
1. Apply rate limits to all public endpoints
2. Use user-based limits for authenticated endpoints
3. Implement graceful degradation
4. Monitor rate limit effectiveness

### Security
1. Don't expose internal rate limit details
2. Use appropriate error messages
3. Implement proper logging
4. Regular security reviews

## Troubleshooting

### Common Issues

1. **Rate limiter not working**
   - Check Redis connection
   - Verify configuration loading
   - Check guard application

2. **Redis connection errors**
   - Verify Redis is running
   - Check connection settings
   - Ensure proper authentication

3. **Configuration not applied**
   - Check environment variables
   - Verify module imports
   - Check decorator usage

### Debug Steps

1. Check application logs for errors
2. Verify Redis connectivity
3. Test rate limiter manually
4. Check configuration values
5. Verify guard application

## Conclusion

This Redis-based rate limiter provides a robust, scalable, and flexible solution for protecting the API from abuse while maintaining good user experience. The implementation follows NestJS best practices and provides comprehensive configuration options for different use cases.
