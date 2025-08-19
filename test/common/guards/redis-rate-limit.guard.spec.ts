import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisRateLimitGuard } from '../../../src/common/guards/redis-rate-limit.guard';
import { RateLimiterService } from '../../../src/common/services/rate-limiter.service';

describe('RedisRateLimitGuard', () => {
  let guard: RedisRateLimitGuard;
  let rateLimiterService: RateLimiterService;

  const mockRateLimiterService = {
    isRateLimited: jest.fn(),
    incrementRequestCount: jest.fn(),
    checkRateLimit: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  };

  const mockExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '127.0.0.1',
        user: { id: '1', email: 'test@example.com' },
        headers: {
          'user-agent': 'test-agent',
        },
      }),
      getResponse: () => ({
        set: jest.fn(),
      }),
    }),
    getHandler: jest.fn().mockReturnValue({}),
    getClass: jest.fn().mockReturnValue({}),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisRateLimitGuard,
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RedisRateLimitGuard>(RedisRateLimitGuard);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow request when not rate limited', async () => {
      mockReflector.get.mockReturnValue({
        windowMs: 60000,
        max: 100,
        identifier: 'ip',
      });
      mockRateLimiterService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        retryAfter: 0,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockRateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
        undefined,
        undefined,
      );
    });

    it('should block request when rate limited', async () => {
      mockReflector.get.mockReturnValue({
        windowMs: 60000,
        max: 100,
        identifier: 'ip',
      });
      mockRateLimiterService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        retryAfter: 60,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockRateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        '127.0.0.1',
        undefined,
        undefined,
      );
    });

    it('should use user ID when available', async () => {
      const contextWithUser = {
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '127.0.0.1',
            user: { id: 'user-123', email: 'test@example.com' },
            headers: {
              'user-agent': 'test-agent',
            },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        retryAfter: 0,
      });

      await guard.canActivate(contextWithUser);

      expect(mockRateLimiterService.checkRateLimit).toHaveBeenCalledWith(
        'user-123',
        undefined,
        undefined,
      );
    });

    it('should fallback to IP when user is not available', async () => {
      const contextWithoutUser = {
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '192.168.1.1',
            headers: {
              'user-agent': 'test-agent',
            },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      await guard.canActivate(contextWithoutUser);

      expect(mockRateLimiterService.isRateLimited).toHaveBeenCalledWith(
        '192.168.1.1',
        expect.any(String),
      );
    });

    it('should handle rate limiter service errors gracefully', async () => {
      mockRateLimiterService.isRateLimited.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Should allow request when rate limiter fails
      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle increment service errors gracefully', async () => {
      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      // Should still allow request when increment fails
      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });
  });

  describe('getIdentifier', () => {
    it('should return user ID when available', () => {
      const request = {
        ip: '127.0.0.1',
        user: { id: 'user-123', email: 'test@example.com' },
      };

      const identifier = guard['getIdentifier'](request);

      expect(identifier).toBe('user-123');
    });

    it('should return IP when user is not available', () => {
      const request = {
        ip: '192.168.1.1',
      };

      const identifier = guard['getIdentifier'](request, { identifier: 'ip' });

      expect(identifier).toBe('192.168.1.1');
    });

    it('should return IP when user has no ID', () => {
      const request = {
        ip: '10.0.0.1',
        user: { email: 'test@example.com' }, // No ID
      };

      const identifier = guard['getIdentifier'](request, { identifier: 'ip' });

      expect(identifier).toBe('10.0.0.1');
    });

    it('should handle null/undefined values', () => {
      const request = {
        ip: undefined,
        user: undefined,
      };

      const identifier = guard['getIdentifier'](request, { identifier: 'ip' });

      expect(identifier).toBe('unknown');
    });
  });

  describe('getWindowKey', () => {
    it('should generate consistent window keys', () => {
      const identifier = 'test-user';
      const key1 = guard['getWindowKey'](identifier);
      const key2 = guard['getWindowKey'](identifier);

      expect(key1).toBe(key2);
      expect(key1).toContain('rate_limit:');
      expect(key1).toContain(identifier);
    });

    it('should generate different keys for different identifiers', () => {
      const key1 = guard['getWindowKey']('user-1');
      const key2 = guard['getWindowKey']('user-2');

      expect(key1).not.toBe(key2);
    });

    it('should include timestamp in window key', () => {
      const identifier = 'test-user';
      const key = guard['getWindowKey'](identifier);

      expect(key).toMatch(/rate_limit:test-user:\d+/);
    });
  });

  describe('edge cases', () => {
    it('should handle missing IP address', async () => {
      const contextWithoutIP = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-123' },
            headers: {
              'user-agent': 'test-agent',
            },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      const result = await guard.canActivate(contextWithoutIP);

      expect(result).toBe(true);
      expect(mockRateLimiterService.isRateLimited).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
      );
    });

    it('should handle malformed request object', async () => {
      const malformedContext = {
        switchToHttp: () => ({
          getRequest: () => null,
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      const result = await guard.canActivate(malformedContext);

      expect(result).toBe(true);
    });

    it('should handle concurrent requests', async () => {
      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      const promises = Array.from({ length: 5 }, () =>
        guard.canActivate(mockExecutionContext),
      );

      const results = await Promise.all(promises);

      expect(results.every((result) => result === true)).toBe(true);
      expect(mockRateLimiterService.isRateLimited).toHaveBeenCalledTimes(5);
      expect(mockRateLimiterService.incrementRequestCount).toHaveBeenCalledTimes(5);
    });

    it('should handle rate limiter service timeout', async () => {
      mockRateLimiterService.isRateLimited.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100),
        ),
      );

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should handle very long identifiers', async () => {
      const longIdentifier = 'a'.repeat(1000);
      const contextWithLongId = {
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '127.0.0.1',
            user: { id: longIdentifier },
            headers: {
              'user-agent': 'test-agent',
            },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      const result = await guard.canActivate(contextWithLongId);

      expect(result).toBe(true);
      expect(mockRateLimiterService.isRateLimited).toHaveBeenCalledWith(
        longIdentifier,
        expect.any(String),
      );
    });

    it('should handle special characters in identifiers', async () => {
      const specialIdentifier = 'user@example.com:123!@#$%^&*()';
      const contextWithSpecialId = {
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '127.0.0.1',
            user: { id: specialIdentifier },
            headers: {
              'user-agent': 'test-agent',
            },
          }),
          getResponse: () => ({
            setHeader: jest.fn(),
          }),
        }),
      } as ExecutionContext;

      mockRateLimiterService.isRateLimited.mockResolvedValue(false);
      mockRateLimiterService.incrementRequestCount.mockResolvedValue(1);

      const result = await guard.canActivate(contextWithSpecialId);

      expect(result).toBe(true);
      expect(mockRateLimiterService.isRateLimited).toHaveBeenCalledWith(
        specialIdentifier,
        expect.any(String),
      );
    });
  });
});
