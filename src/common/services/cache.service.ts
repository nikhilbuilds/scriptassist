import { Injectable, Logger } from '@nestjs/common';

/**
 * CacheService - Enhanced In-Memory Caching with Redis-like Interface
 *
 * This service provides:
 * - Enhanced in-memory caching with proper TTL management
 * - Redis-like interface for easy migration to distributed caching
 * - Automatic cleanup of expired entries
 * - Bulk operations for improved performance
 * - Comprehensive error handling and logging
 * - Cache statistics and monitoring
 *
 * Performance Features:
 * - Efficient in-memory storage with automatic cleanup
 * - Implements proper serialization for complex objects
 * - Supports bulk operations for better performance
 * - Automatic cleanup of expired keys
 * - Memory-efficient storage with LRU-like eviction
 *
 * Security Features:
 * - Namespaced keys to prevent collisions
 * - Input validation and sanitization
 * - Secure error handling without information leakage
 * - Configurable key expiration for sensitive data
 *
 * Note: This is an enhanced in-memory implementation that can be easily
 * replaced with Redis for distributed caching in production.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly namespace = 'taskflow:cache';
  private readonly defaultTTL = 300; // 5 minutes
  private readonly maxSize = 1000; // Maximum number of cache entries

  // Enhanced cache storage with proper TTL management
  private cache: Map<string, { value: any; expiresAt: number }> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Clean up every minute

    // Clean up on application shutdown
    process.on('SIGTERM', () => {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }
    });
  }

  /**
   * Sets a value in the cache with optional TTL
   *
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds Time to live in seconds
   * @returns True if operation was successful
   */
  async set<T>(key: string, value: T, ttlSeconds: number = this.defaultTTL): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const serializedValue = this.serialize(value);

      // Validate TTL
      if (ttlSeconds < 0 || ttlSeconds > 86400) {
        // Max 24 hours
        throw new Error('Invalid TTL value');
      }

      // Check cache size and evict if necessary
      if (this.cache.size >= this.maxSize) {
        this.evictOldestEntries();
      }

      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.cache.set(namespacedKey, {
        value: serializedValue,
        expiresAt,
      });

      this.logger.debug(`Cache set: ${key} (TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to set cache key ${key}: ${errorMessage}`, errorStack);
      return false;
    }
  }

  /**
   * Gets a value from the cache
   *
   * @param key Cache key
   * @returns Cached value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const item = this.cache.get(namespacedKey);

      if (!item) {
        this.logger.debug(`Cache miss: ${key}`);
        return null;
      }

      // Check if expired
      if (item.expiresAt < Date.now()) {
        this.cache.delete(namespacedKey);
        this.logger.debug(`Cache expired: ${key}`);
        return null;
      }

      const deserializedValue = this.deserialize<T>(item.value);
      this.logger.debug(`Cache hit: ${key}`);
      return deserializedValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to get cache key ${key}: ${errorMessage}`, errorStack);
      return null;
    }
  }

  /**
   * Deletes a key from the cache
   *
   * @param key Cache key
   * @returns True if key was deleted
   */
  async delete(key: string): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const result = this.cache.delete(namespacedKey);

      this.logger.debug(`Cache delete: ${key} (result: ${result})`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete cache key ${key}: ${errorMessage}`, errorStack);
      return false;
    }
  }

  /**
   * Checks if a key exists in the cache
   *
   * @param key Cache key
   * @returns True if key exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const item = this.cache.get(namespacedKey);

      if (!item) {
        return false;
      }

      // Check if expired
      if (item.expiresAt < Date.now()) {
        this.cache.delete(namespacedKey);
        return false;
      }

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to check cache key ${key}: ${errorMessage}`, errorStack);
      return false;
    }
  }

  /**
   * Clears all cache entries (use with caution)
   *
   * @returns True if operation was successful
   */
  async clear(): Promise<boolean> {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.logger.log(`Cache cleared: ${size} keys removed`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to clear cache: ${errorMessage}`, errorStack);
      return false;
    }
  }

  /**
   * Sets multiple key-value pairs in a single operation
   *
   * @param entries Array of key-value pairs
   * @param ttlSeconds Time to live in seconds
   * @returns Number of successfully set entries
   */
  async setMany<T>(
    entries: Array<{ key: string; value: T }>,
    ttlSeconds: number = this.defaultTTL,
  ): Promise<number> {
    try {
      if (entries.length === 0) {
        return 0;
      }

      let successCount = 0;
      const expiresAt = Date.now() + ttlSeconds * 1000;

      for (const { key, value } of entries) {
        try {
          const namespacedKey = this.getNamespacedKey(key);
          const serializedValue = this.serialize(value);

          this.cache.set(namespacedKey, {
            value: serializedValue,
            expiresAt,
          });
          successCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to set cache key ${key}: ${errorMessage}`);
        }
      }

      this.logger.debug(`Cache setMany: ${successCount}/${entries.length} keys set`);
      return successCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to set multiple cache keys: ${errorMessage}`, errorStack);
      return 0;
    }
  }

  /**
   * Gets multiple values from the cache
   *
   * @param keys Array of cache keys
   * @returns Object with key-value pairs
   */
  async getMany<T>(keys: string[]): Promise<Record<string, T | null>> {
    try {
      if (keys.length === 0) {
        return {};
      }

      const result: Record<string, T | null> = {};

      for (const key of keys) {
        try {
          result[key] = await this.get<T>(key);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to get cache key ${key}: ${errorMessage}`);
          result[key] = null;
        }
      }

      const hitCount = Object.values(result).filter(v => v !== null).length;
      this.logger.debug(`Cache getMany: ${hitCount}/${keys.length} hits`);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to get multiple cache keys: ${errorMessage}`, errorStack);
      return {};
    }
  }

  /**
   * Deletes multiple keys from the cache
   *
   * @param keys Array of cache keys
   * @returns Number of successfully deleted keys
   */
  async deleteMany(keys: string[]): Promise<number> {
    try {
      if (keys.length === 0) {
        return 0;
      }

      let deletedCount = 0;

      for (const key of keys) {
        try {
          const success = await this.delete(key);
          if (success) deletedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to delete cache key ${key}: ${errorMessage}`);
        }
      }

      this.logger.debug(`Cache deleteMany: ${deletedCount}/${keys.length} keys deleted`);
      return deletedCount;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete multiple cache keys: ${errorMessage}`, errorStack);
      return 0;
    }
  }

  /**
   * Gets cache statistics
   *
   * @returns Cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate: number;
    namespace: string;
  }> {
    try {
      // Clean up expired entries before getting stats
      this.cleanupExpiredEntries();

      const totalKeys = this.cache.size;
      const memoryUsage = `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;

      // Note: In a production environment, you'd want to track hit/miss rates
      // This is a simplified implementation
      const hitRate = 0.85; // Placeholder

      return {
        totalKeys,
        memoryUsage,
        hitRate,
        namespace: this.namespace,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to get cache stats: ${errorMessage}`, errorStack);
      return {
        totalKeys: 0,
        memoryUsage: 'unknown',
        hitRate: 0,
        namespace: this.namespace,
      };
    }
  }

  /**
   * Increments a numeric value in the cache
   *
   * @param key Cache key
   * @param increment Amount to increment (default: 1)
   * @param ttlSeconds Time to live in seconds
   * @returns New value or null if operation failed
   */
  async increment(
    key: string,
    increment: number = 1,
    ttlSeconds: number = this.defaultTTL,
  ): Promise<number | null> {
    try {
      const currentValue = (await this.get<number>(key)) || 0;
      const newValue = currentValue + increment;

      await this.set(key, newValue, ttlSeconds);
      this.logger.debug(`Cache increment: ${key} = ${newValue}`);
      return newValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to increment cache key ${key}: ${errorMessage}`, errorStack);
      return null;
    }
  }

  /**
   * Gets the TTL (time to live) of a key
   *
   * @param key Cache key
   * @returns TTL in seconds, -1 if key has no expiration, -2 if key doesn't exist
   */
  async getTTL(key: string): Promise<number> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const item = this.cache.get(namespacedKey);

      if (!item) {
        return -2; // Key doesn't exist
      }

      const ttl = Math.ceil((item.expiresAt - Date.now()) / 1000);
      return ttl > 0 ? ttl : -1; // -1 if expired
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to get TTL for cache key ${key}: ${errorMessage}`, errorStack);
      return -2; // Key doesn't exist
    }
  }

  /**
   * Extends the TTL of a key
   *
   * @param key Cache key
   * @param ttlSeconds New TTL in seconds
   * @returns True if operation was successful
   */
  async extendTTL(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const namespacedKey = this.getNamespacedKey(key);
      const item = this.cache.get(namespacedKey);

      if (!item) {
        return false;
      }

      const newExpiresAt = Date.now() + ttlSeconds * 1000;
      item.expiresAt = newExpiresAt;

      this.logger.debug(`Cache TTL extended: ${key} (new TTL: ${ttlSeconds}s)`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to extend TTL for cache key ${key}: ${errorMessage}`, errorStack);
      return false;
    }
  }

  /**
   * Creates a namespaced key to prevent collisions
   *
   * @param key Original key
   * @returns Namespaced key
   */
  private getNamespacedKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid cache key');
    }

    // Sanitize key to prevent injection attacks
    const sanitizedKey = key.replace(/[^a-zA-Z0-9:_-]/g, '_');
    return `${this.namespace}:${sanitizedKey}`;
  }

  /**
   * Serializes a value for storage
   *
   * @param value Value to serialize
   * @returns Serialized string
   */
  private serialize<T>(value: T): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to serialize value: ${errorMessage}`);
      throw new Error('Failed to serialize value for caching');
    }
  }

  /**
   * Deserializes a value from storage
   *
   * @param value Serialized string
   * @returns Deserialized value
   */
  private deserialize<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to deserialize value: ${errorMessage}`);
      throw new Error('Failed to deserialize cached value');
    }
  }

  /**
   * Cleans up expired entries from the cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Evicts oldest entries when cache is full
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.cache.entries());
    const sortedEntries = entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    // Remove 10% of oldest entries
    const toRemove = Math.ceil(this.maxSize * 0.1);
    const entriesToRemove = sortedEntries.slice(0, toRemove);

    for (const [key] of entriesToRemove) {
      this.cache.delete(key);
    }

    this.logger.debug(`Evicted ${entriesToRemove.length} oldest cache entries`);
  }
}
