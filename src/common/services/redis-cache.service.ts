import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
}

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly redis: Redis;
  private readonly defaultTTL = 300; // 5 minutes default
  private readonly defaultPrefix = 'app';

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get('REDIS_DB', 0),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis is ready');
    });
  }

  private getKey(key: string, prefix?: string): string {
    const keyPrefix = prefix || this.defaultPrefix;
    return `${keyPrefix}:${key}`;
  }

  async set<T>(
    key: string, 
    value: T, 
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const { ttl = this.defaultTTL, prefix } = options;
      const fullKey = this.getKey(key, prefix);
      
      const serializedValue = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.setex(fullKey, ttl, serializedValue);
      } else {
        await this.redis.set(fullKey, serializedValue);
      }

      this.logger.debug(`Cache set: ${fullKey} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      throw error;
    }
  }

  async get<T>(key: string, prefix?: string): Promise<T | null> {
    try {
      const fullKey = this.getKey(key, prefix);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.logger.debug(`Cache miss: ${fullKey}`);
        return null;
      }

      this.logger.debug(`Cache hit: ${fullKey}`);
      
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.logger.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  }

  async delete(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getKey(key, prefix);
      const result = await this.redis.del(fullKey);
      this.logger.debug(`Cache delete: ${fullKey} (result: ${result})`);
      return result > 0;
    } catch (error) {
      this.logger.error(`Failed to delete cache key ${key}:`, error);
      return false;
    }
  }

  async clear(prefix?: string): Promise<void> {
    try {
      const pattern = prefix ? `${prefix}:*` : `${this.defaultPrefix}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Cleared ${keys.length} cache keys with pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  async has(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getKey(key, prefix);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Failed to check cache key ${key}:`, error);
      return false;
    }
  }

  async increment(key: string, value = 1, options: CacheOptions = {}): Promise<number> {
    try {
      const { ttl = this.defaultTTL, prefix } = options;
      const fullKey = this.getKey(key, prefix);
      
      const result = await this.redis.incrby(fullKey, value);
      
      // Set TTL if it doesn't exist
      if (ttl > 0) {
        await this.redis.expire(fullKey, ttl);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to increment cache key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, ttl: number, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.getKey(key, prefix);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to set expiry for cache key ${key}:`, error);
      return false;
    }
  }

  async getTTL(key: string, prefix?: string): Promise<number> {
    try {
      const fullKey = this.getKey(key, prefix);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      this.logger.error(`Failed to get TTL for cache key ${key}:`, error);
      return -1;
    }
  }

  // Bulk operations for better performance
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>, prefix?: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const entry of entries) {
        const fullKey = this.getKey(entry.key, prefix);
        const serializedValue = typeof entry.value === 'string' 
          ? entry.value 
          : JSON.stringify(entry.value);

        if (entry.ttl && entry.ttl > 0) {
          pipeline.setex(fullKey, entry.ttl, serializedValue);
        } else {
          pipeline.set(fullKey, serializedValue);
        }
      }

      await pipeline.exec();
      this.logger.debug(`Bulk set ${entries.length} cache entries`);
    } catch (error) {
      this.logger.error('Failed to bulk set cache entries:', error);
      throw error;
    }
  }

  async mget<T>(keys: string[], prefix?: string): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.getKey(key, prefix));
      const values = await this.redis.mget(...fullKeys);
      
      return values.map(value => {
        if (value === null) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      this.logger.error('Failed to bulk get cache entries:', error);
      return keys.map(() => null);
    }
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Graceful shutdown
  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }
}
